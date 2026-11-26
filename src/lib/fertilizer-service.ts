import { Prisma } from "@prisma/client";
import { db } from "./db";
import { canSchedule, fieldHectares } from "./smart-fertilizer";
import { soilLocationsMatch } from "./soil-health-links";

export const ownedCycleWhere = (userId: string, id: string) => ({
  id,
  field: { farm: { userId } },
});
export const jsonValue = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v));

/** Dates are projections from the cycle; completed entries keep their actual history. */
export async function reconcileFertilizerSchedules(
  userId: string,
  cycleId: string,
  tx: Prisma.TransactionClient = db,
) {
  const cycle = await tx.cropCycle.findFirst({
    where: ownedCycleWhere(userId, cycleId),
    include: { field: { include: { farm: true } } },
  });
  if (!cycle) return;
  const entries = await tx.fertilizerApplication.findMany({
    where: { cropCycleId: cycleId, planId: { not: null } },
    include: { plan: { include: { reference: true } } },
  });
  for (const entry of entries) {
    const snapshot = entry.plan!.input as {
      fieldId: string;
      cropId: string;
      areaHa: number;
      fieldAreaHa?: number;
      season: string;
      soilType: string;
      standardCropPlan?: boolean;
      state?: string;
      district?: string;
      sowingDate?: string;
    };
    const source = entry.plan!.reference.metadata as {
      title?: string;
      url?: string;
    };
    const invalid =
      entry.status === "PLANNED" &&
      (!canSchedule(cycle) ||
        snapshot.fieldId !== cycle.fieldId ||
        snapshot.cropId !== cycle.cropId ||
        snapshot.season !== cycle.season ||
        snapshot.soilType !== cycle.field.soilType ||
        Math.abs(
          (snapshot.fieldAreaHa ?? snapshot.areaHa) -
            fieldHectares(Number(cycle.field.area), cycle.field.areaUnit),
        ) > 1e-8 ||
        (!!snapshot.standardCropPlan &&
          (snapshot.sowingDate !==
            cycle.sowingDate?.toISOString().slice(0, 10) ||
            !soilLocationsMatch(
              {
                state: snapshot.state ?? "",
                district: snapshot.district ?? "",
              },
              cycle.field.farm,
            ))));
    const date =
      entry.status !== "PLANNED"
        ? entry.scheduledDate
        : new Date(
            (cycle.sowingDate?.getTime() ?? entry.scheduledDate.getTime()) +
              (entry.offsetDays ?? 0) * 86400000,
          );
    const cancelled =
      entry.status === "CANCELLED" ||
      invalid ||
      (entry.status === "PLANNED" &&
        !!cycle.expectedHarvestDate &&
        date >= cycle.expectedHarvestDate);
    if (
      entry.status === "PLANNED" &&
      (cancelled || date.getTime() !== entry.scheduledDate.getTime())
    )
      await tx.fertilizerApplication.update({
        where: { id: entry.id },
        data: {
          status: cancelled ? "CANCELLED" : "PLANNED",
          scheduledDate: cancelled ? entry.scheduledDate : date,
          version: { increment: 1 },
          revisions: jsonValue([
            ...(Array.isArray(entry.revisions) ? entry.revisions : []),
            { ...entry, plan: undefined, revisions: undefined },
          ]),
        },
      });
    const key = `fertilizer:${entry.id}`;
    const calendar = await tx.cropCalendar.findUnique({
      where: { cropCycleId: cycleId },
      select: { id: true },
    });
    if (calendar) {
      const status = cancelled
        ? "CANCELLED"
        : entry.status === "APPLIED"
          ? "COMPLETED"
          : entry.status === "SKIPPED"
            ? "SKIPPED"
            : "PENDING";
      const projection = {
        isManuallyModified:
          entry.notes?.startsWith("Farmer-adjusted timing") ?? false,
        activityName: `Fertilizer · ${entry.product}`,
        activityType: "FERTILIZER",
        growthStage: null,
        scheduledDate: date,
        actualCompletionDate: entry.appliedDate,
        description: `${entry.quantityKg} kg ${entry.product}.`,
        recommendation:
          "Review the source, crop stage, prior applications and weather before applying. Overdue dates are not catch-up instructions.",
        status,
        source: source.title ?? entry.plan!.referenceId,
        sourceUrl: source.url ?? null,
      };
      await tx.cropCalendarActivity.upsert({
        where: {
          calendarId_activityKey: {
            calendarId: calendar.id,
            activityKey: `smart-fertilizer:${entry.id}`,
          },
        },
        create: {
          calendarId: calendar.id,
          activityKey: `smart-fertilizer:${entry.id}`,
          ...projection,
        },
        update: projection,
      });
    }
    if (cancelled || entry.status !== "PLANNED") {
      await tx.alert.updateMany({
        where: { userId, dedupeKey: key },
        data: {
          readAt: new Date(),
          message:
            "Application cancelled after crop-cycle changes. Review the crop calendar.",
        },
      });
      await tx.cropCalendarEvent.deleteMany({
        where: { userId, cropCycleId: cycleId, notes: key },
      });
    } else {
      const message = `${entry.product}: ${entry.quantityKg} kg planned for ${date.toISOString().slice(0, 10)}. Review weather and field conditions before applying.`;
      // Only upcoming or overdue planned applications enter the existing notification inbox.
      if (date.getTime() <= Date.now() + 7 * 86400000)
        await tx.alert.upsert({
          where: { userId_dedupeKey: { userId, dedupeKey: key } },
          create: {
            userId,
            dedupeKey: key,
            title: "Fertilizer application review",
            message,
            href: "/crop-calendar",
          },
          update: { message, href: "/crop-calendar" },
        });
      else
        await tx.alert.updateMany({
          where: { userId, dedupeKey: key },
          data: { readAt: new Date(), message },
        });
      const event = await tx.cropCalendarEvent.findFirst({
        where: { userId, cropCycleId: cycleId, notes: key },
      });
      if (event)
        await tx.cropCalendarEvent.update({
          where: { id: event.id },
          data: { eventDate: date },
        });
      else
        await tx.cropCalendarEvent.create({
          data: {
            userId,
            cropCycleId: cycleId,
            title: `Fertilizer · ${entry.product}`,
            eventDate: date,
            notes: key,
          },
        });
    }
  }
}
