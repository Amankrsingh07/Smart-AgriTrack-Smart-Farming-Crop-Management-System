import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { cropCalendarProfileNames, getCropCalendarProfileOptions } from "@/lib/crop-calendar";
import CropCalendarDashboard, { type CalendarRecord, type CropCycleOption } from "./ui";
import { generateCalendarForCycle } from "@/lib/crop-calendar-service";

export const dynamic = "force-dynamic";

export default async function CropCalendarPage() {
  const user = await getUser();
  if (!user) return null;
  const cycles = await db.cropCycle.findMany({
      where: { status: { in: ["PLANNED", "ACTIVE"] }, field: { farm: { userId: user.id } } },
      include: { crop: { include: { climateRequirement: true } }, field: { include: { farm: true } } }, orderBy: { createdAt: "desc" },
    });
  const existing = await db.cropCalendar.findMany({ where: { userId: user.id }, select: { cropCycleId: true, sowingDate: true, estimatedHarvestDate: true, cropVariety: true } });
  const savedByCycle = new Map(existing.map(item => [item.cropCycleId, item]));
  // Refresh schedules on visit when Crop Management dates, variety, or field setup changed.
  await Promise.all(cycles.map(async cycle => {
    if (!cycle.sowingDate || !getCropCalendarProfileOptions(cycle.crop.name).hasCalendarProfile) return;
    const saved = savedByCycle.get(cycle.id);
    const variety = cycle.cropVariety ?? saved?.cropVariety;
    if (getCropCalendarProfileOptions(cycle.crop.name).requiresVariety && !variety) return;
    const expectedChanged = cycle.expectedHarvestDate && saved?.estimatedHarvestDate && cycle.expectedHarvestDate.toISOString().slice(0, 10) !== saved.estimatedHarvestDate.toISOString().slice(0, 10);
    if (!saved || saved.sowingDate.toISOString().slice(0, 10) !== cycle.sowingDate.toISOString().slice(0, 10) || expectedChanged || saved.cropVariety !== variety) {
      try { await generateCalendarForCycle(user.id, { cropCycleId: cycle.id }); } catch { /* Missing reference/setup data is shown in the planner instead of blocking the page. */ }
    }
  }));
  const calendars = await db.cropCalendar.findMany({
      where: { userId: user.id },
      include: { crop: { select: { name: true } }, farm: { select: { name: true, state: true, district: true } }, cropCycle: { include: { field: { select: { name: true } } } }, activities: { orderBy: { scheduledDate: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
  const cycleOptions: CropCycleOption[] = cycles.map(cycle => ({
    id: cycle.id, crop: cycle.crop.name, variety: cycle.cropVariety, season: cycle.season, farm: cycle.field.farm.name, field: cycle.field.name,
    ...getCropCalendarProfileOptions(cycle.crop.name),
    state: cycle.field.farm.state, district: cycle.field.farm.district,
    sowingDate: cycle.sowingDate?.toISOString().slice(0, 10) ?? "",
    landArea: Number(cycle.field.area), areaUnit: cycle.field.areaUnit.toLowerCase().startsWith("hect") ? "hectare" : "acre",
    soilType: cycle.field.soilTexture ?? cycle.field.soilType,
    irrigationMethod: cycle.field.irrigationMethod,
    durationDays: cycle.cropDurationDays ?? cycle.crop.climateRequirement?.cropDurationDays ?? null,
  }));
  const records: CalendarRecord[] = calendars.map(calendar => ({
    id: calendar.id, cropCycleId: calendar.cropCycleId, crop: calendar.crop.name, farm: calendar.farm.name, field: calendar.cropCycle.field.name,
    state: calendar.state, district: calendar.district, variety: calendar.cropVariety,
    sowingDate: calendar.sowingDate.toISOString().slice(0, 10), harvestDate: calendar.estimatedHarvestDate?.toISOString().slice(0, 10) ?? null,
    landArea: Number(calendar.landArea), areaUnit: calendar.areaUnit, soilType: calendar.soilType, irrigationMethod: calendar.irrigationMethod,
    activities: calendar.activities.map(activity => ({
      id: activity.id, key: activity.activityKey, name: activity.activityName, type: activity.activityType, stage: activity.growthStage,
      date: activity.scheduledDate.toISOString().slice(0, 10), actualDate: activity.actualCompletionDate?.toISOString() ?? null,
      description: activity.description, recommendation: activity.recommendation, status: activity.status,
      isWeatherAdjusted: activity.isWeatherAdjusted, isManuallyModified: activity.isManuallyModified,
      notes: activity.notes, source: activity.source, sourceUrl: activity.sourceUrl,
    })),
  }));
  return <CropCalendarDashboard cycles={cycleOptions} calendars={records} availableCrops={cropCalendarProfileNames}/>;
}
