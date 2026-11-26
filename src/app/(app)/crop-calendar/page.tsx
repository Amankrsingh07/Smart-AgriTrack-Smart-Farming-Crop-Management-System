import { calendarLabel, calendarText } from "@/i18n/crop-calendar/format";
import { calendarCatalog } from "@/i18n/crop-calendar";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { protectionText } from "@/i18n/crop-protection";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import {
  cropCalendarDatasetVersion,
  cropCalendarProfileNames,
  getCropCalendarProfileOptions,
} from "@/lib/crop-calendar";
import CropCalendarDashboard, {
  type CalendarRecord,
  type CropCycleOption,
} from "./ui";
import { generateCalendarForCycle } from "@/lib/crop-calendar-service";

export const dynamic = "force-dynamic";

export default async function CropCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const [user, params] = await Promise.all([getUser(), searchParams]);
  if (!user) return null;
  const cycles = await db.cropCycle.findMany({
    where: {
      status: { in: ["PLANNED", "ACTIVE"] },
      field: { farm: { userId: user.id } },
    },
    include: {
      crop: { include: { climateRequirement: true } },
      field: { include: { farm: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const existing = await db.cropCalendar.findMany({
    where: { userId: user.id },
    select: {
      cropCycleId: true,
      cropId: true,
      sowingDate: true,
      estimatedHarvestDate: true,
      cropVariety: true,
      datasetVersion: true,
      landArea: true,
      soilType: true,
      irrigationMethod: true,
    },
  });
  const savedByCycle = new Map(
    existing.map((item) => [item.cropCycleId, item]),
  );
  // Refresh schedules on visit when Crop Management dates, variety, or field setup changed.
  await Promise.all(
    cycles.map(async (cycle) => {
      if (
        !cycle.sowingDate ||
        !getCropCalendarProfileOptions(cycle.crop.name).hasCalendarProfile
      )
        return;
      const saved = savedByCycle.get(cycle.id);
      const variety = cycle.cropVariety ?? saved?.cropVariety;
      if (
        getCropCalendarProfileOptions(cycle.crop.name).requiresVariety &&
        !variety
      )
        return;
      const expectedChanged =
        cycle.expectedHarvestDate &&
        saved?.estimatedHarvestDate &&
        cycle.expectedHarvestDate.toISOString().slice(0, 10) !==
          saved.estimatedHarvestDate.toISOString().slice(0, 10);
      const fieldChanged =
        saved &&
        (Number(saved.landArea) !== Number(cycle.field.area) ||
          saved.soilType !==
            (cycle.field.soilTexture ?? cycle.field.soilType) ||
          saved.irrigationMethod !== cycle.field.irrigationMethod);
      if (
        !saved ||
        saved.cropId !== cycle.cropId ||
        saved.datasetVersion !== cropCalendarDatasetVersion ||
        saved.sowingDate.toISOString().slice(0, 10) !==
          cycle.sowingDate.toISOString().slice(0, 10) ||
        expectedChanged ||
        saved.cropVariety !== variety ||
        fieldChanged
      ) {
        try {
          await generateCalendarForCycle(user.id, { cropCycleId: cycle.id });
        } catch {
          /* Missing reference/setup data is shown in the planner instead of blocking the page. */
        }
      }
    }),
  );
  const calendars = await db.cropCalendar.findMany({
    where: { userId: user.id },
    include: {
      crop: { select: { name: true } },
      farm: { select: { name: true, state: true, district: true } },
      cropCycle: { include: { field: { select: { name: true } } } },
      activities: { orderBy: { scheduledDate: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const cycleOptions: CropCycleOption[] = cycles.map((cycle) => ({
    id: cycle.id,
    crop: cycle.crop.name,
    variety: cycle.cropVariety,
    season: cycle.season,
    farm: cycle.field.farm.name,
    field: cycle.field.name,
    ...getCropCalendarProfileOptions(cycle.crop.name),
    state: cycle.field.farm.state,
    district: cycle.field.farm.district,
    sowingDate: cycle.sowingDate?.toISOString().slice(0, 10) ?? "",
    landArea: Number(cycle.field.area),
    areaUnit: cycle.field.areaUnit.toLowerCase().startsWith("hect")
      ? "hectare"
      : "acre",
    soilType: cycle.field.soilTexture ?? cycle.field.soilType,
    irrigationMethod: cycle.field.irrigationMethod,
    durationDays:
      cycle.cropDurationDays ??
      cycle.crop.climateRequirement?.cropDurationDays ??
      null,
  }));
  const records: CalendarRecord[] = calendars.map((calendar) => ({
    id: calendar.id,
    cropCycleId: calendar.cropCycleId,
    crop: calendar.crop.name,
    farm: calendar.farm.name,
    field: calendar.cropCycle.field.name,
    state: calendar.state,
    district: calendar.district,
    variety: calendar.cropVariety,
    observedGrowthStage: calendar.cropCycle.growthStage,
    sowingDate: calendar.sowingDate.toISOString().slice(0, 10),
    harvestDate:
      calendar.estimatedHarvestDate?.toISOString().slice(0, 10) ?? null,
    landArea: Number(calendar.landArea),
    areaUnit: calendar.areaUnit,
    soilType: calendar.soilType,
    irrigationMethod: calendar.irrigationMethod,
    activities: calendar.activities.map((activity) => ({
      id: activity.id,
      key: activity.activityKey,
      name: activity.activityName,
      type: activity.activityType,
      stage: activity.growthStage,
      date: activity.scheduledDate.toISOString().slice(0, 10),
      actualDate: activity.actualCompletionDate?.toISOString() ?? null,
      description: activity.description,
      recommendation: activity.recommendation,
      status: activity.status,
      isWeatherAdjusted: activity.isWeatherAdjusted,
      isManuallyModified: activity.isManuallyModified,
      notes: activity.notes,
      source: activity.source,
      sourceUrl: activity.sourceUrl,
    })),
  }));
  const locale = await getLocale();
  const storageReminders = await db.alert.findMany({
    where: {
      userId: user.id,
      dedupeKey: { startsWith: "loss:" },
      productionId: { not: null },
      dueOn: { not: null },
      completedAt: null,
      href: { startsWith: "/crop-loss?" },
    },
    select: {
      id: true,
      dueOn: true,
      cropName: true,
      message: true,
      href: true,
    },
    orderBy: { dueOn: "asc" },
    take: 50,
  });
  const catalog = calendarCatalog(locale);
  const l = (text: string) => calendarText(catalog, text);
  const protectionEvents = await db.cropCalendarEvent.findMany({
    where: {
      userId: user.id,
      notes: { contains: "Report: /crop-protection/" },
    },
    orderBy: { eventDate: "asc" },
    take: 200,
  });
  return (
    <>
      <CropCalendarDashboard
        catalog={catalog}
        key={params.cycle ?? ""}
        initialCycleId={params.cycle}
        cycles={cycleOptions}
        calendars={records}
        availableCrops={cropCalendarProfileNames}
      />
      {storageReminders.length > 0 && (
        <section className="panel" style={{ marginTop: 20 }}>
          <h2>{protectionText(locale, "Prevention reminders")}</h2>
          <ul>
            {storageReminders.map((reminder) => (
              <li key={reminder.id}>
                <time dateTime={reminder.dueOn!.toISOString().slice(0, 10)}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }).format(reminder.dueOn!)}
                </time>
                {" · "}
                <Link href={reminder.href!}>
                  {reminder.cropName &&
                    calendarLabel(catalog, locale, reminder.cropName)}
                </Link>
                <p>{protectionText(locale, reminder.message)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {protectionEvents.length > 0 && (
        <section className="panel" style={{ marginTop: 20 }}>
          <h2>{l("Additional crop protection reminders")}</h2>
          <ul>
            {protectionEvents.map((event) => (
              <li key={event.id} style={{ margin: "14px 0" }}>
                <strong>
                  {new Intl.DateTimeFormat(locale, {
                    timeZone: "UTC",
                    dateStyle: "medium",
                  }).format(event.eventDate)}{" "}
                  · {protectionText(locale, event.title)}
                </strong>
                <p>
                  {event.notes &&
                    protectionText(locale, event.notes.split(" Report: ")[0])}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
