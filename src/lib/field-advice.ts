import references from "@/data/agriculture/field-advice.json";
import { soilKey } from "@/lib/saved-crop-soil-advice";
import {
  agriculturalKnowledge,
  normalizeProtectionCrop,
} from "@/lib/agricultural-knowledge";
import type { OpenMeteoForecast } from "@/lib/open-meteo";

export function fieldRain(forecast: OpenMeteoForecast | null, day: string) {
  if (!forecast || forecast.demo) return null;
  const index = forecast.daily.time.indexOf(day);
  const rain = forecast.daily.precipitation_sum[index];
  return typeof rain === "number" && Number.isFinite(rain) && rain >= 0
    ? rain
    : null;
}

export function savedProtectionRisks(crop: string, findings: unknown) {
  const suspects = (findings as { topSuspects?: unknown } | null)?.topSuspects;
  if (!Array.isArray(suspects)) return [];
  const ids = new Set(
    suspects.flatMap((value) =>
      typeof value?.id === "string" ? [value.id] : [],
    ),
  );
  const cropKey = normalizeProtectionCrop(crop);
  return agriculturalKnowledge.records
    .filter(
      (record) =>
        ids.has(record.id) &&
        record.verificationStatus === "SOURCE_LINKED_SCREENING" &&
        /pest|fungal|bacterial|viral|oomycete|insect/i.test(record.category) &&
        record.crops.some((name) => normalizeProtectionCrop(name) === cropKey),
    )
    .map((record) => ({
      name: record.name,
      source: record.source,
      reviewed: record.lastReviewed,
    }));
}

export type FieldAdviceContext = {
  crop: string;
  status: string;
  today: string;
  stage: string | null;
  harvest: string | null;
  harvested: boolean;
  soilSample: string | null;
  hasCoordinates: boolean;
  rain: number | null;
  calendar: string | null;
  irrigation: string | null;
  fertilizer: string | null;
  fertilizerRecord: string | null;
  protection: string | null;
  protectionConcern: boolean;
  loss: string | null;
  exposedRainDate?: string | null;
};

export function fieldAdvice(context: FieldAdviceContext) {
  const {
    today,
    rain,
    harvest,
    calendar,
    irrigation,
    fertilizer,
    loss,
    exposedRainDate,
  } = context;

  const finished =
    context.harvested || ["HARVESTED", "COMPLETED"].includes(context.status);
  const growing = context.status === "ACTIVE" && !finished;
  const profile = references.harvestSigns.find((item) =>
    item.names.includes(soilKey(context.crop)),
  );
  const harvestSign =
    profile?.crop === "rice"
      ? "riceSign"
      : profile?.crop === "wheat"
        ? "wheatSign"
        : profile?.crop === "maize"
          ? "maizeSign"
          : "harvestGeneric";
  const tasks = [
    {
      topic: "protection",
      message: context.protectionConcern
        ? "safetyReview"
        : context.protection
          ? "reviewProtection"
          : finished
            ? "pastRecords"
            : "scout",
      priority: context.protectionConcern
        ? 0
        : growing && !context.protection
          ? 7
          : null,
    },
    {
      topic: "weather",
      message:
        rain === null
          ? context.hasCoordinates
            ? "weatherMissing"
            : "locationMissing"
          : rain > 0
            ? "rainReview"
            : "dryForecast",
      priority: growing && rain !== null && rain > 0 ? 1 : null,
    },
    {
      topic: "harvest",
      message: finished
        ? "harvestRecords"
        : harvest && harvest < today
          ? "harvestOverdue"
          : harvestSign,
      date: harvest,
      priority:
        growing &&
        (context.stage === "Maturity" || (harvest && harvest <= today))
          ? 2
          : null,
    },
    {
      topic: "loss",
      message: exposedRainDate
        ? "rainLoss"
        : loss
          ? "lossDue"
          : finished
            ? "checkStorage"
            : "checkLoss",
      date: exposedRainDate ?? loss,
      priority: exposedRainDate || (loss && loss <= today) ? 3 : null,
    },
    {
      topic: "irrigation",
      message: finished
        ? "pastRecords"
        : irrigation
          ? "waterDue"
          : "checkMoisture",
      date: irrigation,
      priority: growing && irrigation === today ? 4 : null,
    },
    {
      topic: "fertilizer",
      message: finished
        ? "pastRecords"
        : fertilizer
          ? "fertilizerDue"
          : context.fertilizerRecord
            ? "fertilizerSaved"
            : context.soilSample
              ? "useSoilReport"
              : "needSoilReport",
      date: fertilizer ?? context.fertilizerRecord ?? context.soilSample,
      priority: !finished && fertilizer === today ? 5 : null,
    },
    {
      topic: "calendar",
      message: finished
        ? "pastRecords"
        : calendar
          ? "calendarDue"
          : context.stage
            ? "stageSaved"
            : "stageMissing",
      date: calendar,
      priority:
        !finished && calendar === today
          ? 6
          : growing && !context.stage
            ? 8
            : null,
    },
  ] as const;
  return {
    tasks,
    image: profile?.crop ?? "field",
    harvestSource: profile?.url,
  };
}
