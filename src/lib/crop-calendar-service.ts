import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { generateCropCalendarActivities, cropCalendarDatasetVersion, toHectares } from "@/lib/crop-calendar";
import { reconcileCropCalendarActivities } from "@/lib/crop-calendar-reconciliation";

// Crop Management is the source of truth. Date and field details are never accepted
// from the calendar form, so editing a generated calendar cannot fork crop records.
export type CropCalendarInput = { cropCycleId: string; cropVariety?: string; sowingDate?: string };

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const dateAtUtc = (value: Date) => new Date(`${dateKey(value)}T00:00:00.000Z`);
const elapsedDays = (start: Date, end: Date) => Math.round((dateAtUtc(end).getTime() - dateAtUtc(start).getTime()) / 86_400_000);
const irrigationMarker = (cycleId: string, activityKey: string) => `calendar:${cycleId}:${activityKey}`;

export async function generateCalendarForCycle(userId: string, input: CropCalendarInput) {
  const cycle = await db.cropCycle.findFirst({
    where: { id: input.cropCycleId, field: { farm: { userId } } },
    include: { crop: { include: { climateRequirement: true } }, field: { include: { farm: true } }, cropCalendar: { include: { activities: true } } },
  });
  if (!cycle) throw new Error("Crop cycle was not found in your account.");
  const requestedSowingDate = input.sowingDate ? new Date(`${input.sowingDate}T00:00:00.000Z`) : cycle.sowingDate;
  if (!requestedSowingDate || Number.isNaN(requestedSowingDate.getTime()) || (input.sowingDate && requestedSowingDate.toISOString().slice(0, 10) !== input.sowingDate)) throw new Error("Enter a valid sowing date before generating this calendar.");

  const oldCalendar = cycle.cropCalendar;
  const sowingDate = dateAtUtc(requestedSowingDate);
  const variety = input.cropVariety?.trim().slice(0, 120) || cycle.cropVariety || oldCalendar?.cropVariety || null;
  const fieldArea = Number(cycle.field.area);
  const areaUnit = cycle.field.areaUnit.toLowerCase().startsWith("hect") ? "hectare" : "acre";
  const landArea = fieldArea > 0 ? fieldArea : oldCalendar ? Number(oldCalendar.landArea) : NaN;
  if (!Number.isFinite(landArea) || landArea <= 0) throw new Error("Add a valid field area in Farm Management before generating this calendar.");

  // An expected date differing from the previous generated date is a farmer-set
  // date. Use it to derive a duration; otherwise keep the existing crop duration.
  const expectedDateIsOverride = Boolean(cycle.expectedHarvestDate && (!oldCalendar?.estimatedHarvestDate || dateKey(cycle.expectedHarvestDate) !== dateKey(oldCalendar.estimatedHarvestDate)));
  const storedDateMatchesCalendar = Boolean(oldCalendar?.estimatedHarvestDate && cycle.expectedHarvestDate && dateKey(oldCalendar.estimatedHarvestDate) === dateKey(cycle.expectedHarvestDate));
  const storedDurationIsGenerated = Boolean(storedDateMatchesCalendar && cycle.cropDurationDays === elapsedDays(oldCalendar!.sowingDate, oldCalendar!.estimatedHarvestDate!));
  const farmerDuration = cycle.cropDurationDays !== null && cycle.cropDurationDays !== cycle.crop.climateRequirement?.cropDurationDays && !storedDurationIsGenerated
    ? cycle.cropDurationDays
    : null;
  const customDuration = expectedDateIsOverride && cycle.expectedHarvestDate
    ? elapsedDays(sowingDate, cycle.expectedHarvestDate)
    : farmerDuration;
  if (customDuration !== null && customDuration !== undefined && customDuration <= 0) throw new Error("Expected harvest date must be after the sowing date.");
  const generated = generateCropCalendarActivities({
    cropName: cycle.crop.name, state: cycle.field.farm.state, district: cycle.field.farm.district,
    season: cycle.season, sowingDate, variety, durationDays: customDuration,
    areaHa: toHectares(landArea, areaUnit),
  });
  const soilType = cycle.field.soilTexture ?? cycle.field.soilType ?? oldCalendar?.soilType ?? "Not recorded";
  const irrigationMethod = cycle.field.irrigationMethod ?? oldCalendar?.irrigationMethod ?? "Not recorded";
  const calendarStatus = cycle.status;

  const calendar = await db.$transaction(async tx => {
    const saved = await tx.cropCalendar.upsert({
      where: { cropCycleId: cycle.id },
      create: {
        userId, farmId: cycle.field.farmId, cropCycleId: cycle.id, cropId: cycle.cropId, cropVariety: variety,
        state: cycle.field.farm.state, district: cycle.field.farm.district, sowingDate, landArea: new Prisma.Decimal(landArea),
        areaUnit, soilType, irrigationMethod, estimatedHarvestDate: generated.estimatedHarvestDate, datasetVersion: cropCalendarDatasetVersion,
        status: calendarStatus,
      },
      update: {
        cropId: cycle.cropId, cropVariety: variety, state: cycle.field.farm.state, district: cycle.field.farm.district,
        sowingDate, landArea: new Prisma.Decimal(landArea), areaUnit, soilType, irrigationMethod,
        estimatedHarvestDate: expectedDateIsOverride ? cycle.expectedHarvestDate : generated.estimatedHarvestDate,
        status: calendarStatus,
        datasetVersion: cropCalendarDatasetVersion,
      },
    });
    const existing = await tx.cropCalendarActivity.findMany({ where: { calendarId: saved.id } });
    const reconciliation = reconcileCropCalendarActivities(existing, generated.activities);
    for (const activity of reconciliation.toUpsert) {
      const updated = await tx.cropCalendarActivity.upsert({
        where: { calendarId_activityKey: { calendarId: saved.id, activityKey: activity.activityKey } },
        create: { calendarId: saved.id, ...activity },
        update: { ...activity, isWeatherAdjusted: false },
      });
      const notice = `${updated.activityName} · ${dateKey(updated.scheduledDate)}`;
      await tx.cropCalendarNotification.deleteMany({ where: { activityId: updated.id, notificationDate: { not: updated.scheduledDate } } });
      await tx.cropCalendarNotification.upsert({
        where: { activityId_notificationDate: { activityId: updated.id, notificationDate: updated.scheduledDate } },
        create: { userId, activityId: updated.id, notificationDate: updated.scheduledDate, message: notice },
        update: { userId, message: notice },
      });
      if (updated.activityType === "IRRIGATION_REVIEW") {
        const clientTransactionId = irrigationMarker(cycle.id, updated.activityKey);
        const schedule = await tx.irrigationSchedule.findFirst({ where: { clientTransactionId } });
        if (schedule?.completedAt || schedule?.actualQuantityLiters) continue;
        if (schedule) await tx.irrigationSchedule.update({ where: { id: schedule.id }, data: { scheduledAt: updated.scheduledDate, status: "PLANNED", isCheckOnly: true, method: irrigationMethod, recommendationSource: `CROP_CALENDAR_ACTIVITY:${updated.activityKey}` } });
        else await tx.irrigationSchedule.create({ data: {
          clientTransactionId, userId, cropCycleId: cycle.id, scheduledAt: updated.scheduledDate,
          status: "PLANNED", isCheckOnly: true, method: irrigationMethod,
          recommendationSource: `CROP_CALENDAR_ACTIVITY:${updated.activityKey}`,
          recommendationNotes: "Calendar soil and irrigation monitoring reminder. No irrigation amount is implied.",
        } });
      }
    }
    for (const old of reconciliation.removeObsoletePending) {
      await tx.cropCalendarActivity.delete({ where: { id: old.id } });
      // Only the matching generated check-only reminder is eligible for cleanup.
      await tx.irrigationSchedule.deleteMany({ where: { clientTransactionId: irrigationMarker(cycle.id, old.activityKey), completedAt: null } });
    }

    await tx.cropCycle.update({ where: { id: cycle.id }, data: {
      cropVariety: variety,
      sowingDate,
      expectedHarvestDate: expectedDateIsOverride ? cycle.expectedHarvestDate : generated.estimatedHarvestDate,
      cropDurationDays: customDuration ?? generated.duration.days,
    } });
    return saved;
  });
  return { calendarId: calendar.id, generatedCount: generated.activities.length, estimatedHarvestDate: (expectedDateIsOverride && cycle.expectedHarvestDate ? cycle.expectedHarvestDate : generated.estimatedHarvestDate).toISOString().slice(0, 10), durationDays: generated.duration.days, durationRange: generated.duration.range, durationBasis: generated.duration.basis, scopeNote: generated.geographicScopeNote, fertilizerProfileMatched: generated.fertilizerProfileMatched };
}
