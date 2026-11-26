import {
  calculateCropGrowthWindows,
  findCropCalendarProfile,
  getCropGrowthStageProfile,
  selectCropDuration,
} from "./crop-calendar";
import { indiaDateKey, isCropCycleFinished } from "./crop-cycle-status";

type StageInput = {
  crop: string;
  variety?: string | null;
  status: string;
  sowingDate: Date | null;
  expectedHarvestDate: Date | null;
  actualHarvestDate?: Date | null;
  growthStage: string | null;
  growthStageUpdatedAt: Date | null;
  cropDurationDays: number | null;
  climateDurationDays: number | null;
};

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00.000Z`);
const stageLabels: Record<string, string> = {
  Sowing: "Establishment",
  Germination: "Establishment",
  Seedling: "Establishment",
  "Vegetative growth": "Vegetative",
  Tillering: "Vegetative",
  Flowering: "Flowering",
  "Grain / fruit formation": "Fruit / grain formation",
  Maturity: "Maturity",
  Harvesting: "Maturity",
};

export function cropAdviceStage(input: StageInput, today: string) {
  const finished = isCropCycleFinished(input);
  const sowing = input.sowingDate ? indiaDateKey(input.sowingDate) : null;
  const ageDays =
    sowing && sowing <= today
      ? Math.floor((dayNumber(today) - dayNumber(sowing)) / 86_400_000)
      : null;
  const calendar = findCropCalendarProfile(input.crop);
  let duration = input.cropDurationDays ?? input.climateDurationDays ?? null;
  if (!duration && calendar) {
    try {
      duration = selectCropDuration(calendar, input.variety).days;
    } catch {
      duration = null;
    }
  }
  const stageProfile = getCropGrowthStageProfile(input.crop);
  const windows = duration
    ? calculateCropGrowthWindows(input.crop, duration)
    : [];
  const selectedWindow =
    ageDays === null
      ? undefined
      : (windows.find(
          (window) => ageDays >= window.startDay && ageDays <= window.endDay,
        ) ??
        (duration !== null && ageDays >= duration
          ? windows.find((window) => window.key === "maturity")
          : undefined));
  const estimatedStage =
    ageDays === 0
      ? "Establishment"
      : selectedWindow
        ? (stageLabels[selectedWindow.name] ?? null)
        : null;
  const confirmedAt = input.growthStageUpdatedAt
    ? indiaDateKey(input.growthStageUpdatedAt)
    : null;
  const validConfirmation = Boolean(
    input.growthStage &&
    confirmedAt &&
    confirmedAt <= today &&
    (!sowing || confirmedAt >= sowing),
  );
  const initialWindowEnd = windows
    .filter((window) => ["germination", "seedling"].includes(window.key))
    .reduce((end, window) => Math.max(end, window.endDay), 0);
  const staleEstablishment =
    input.growthStage === "Establishment" &&
    ageDays !== null &&
    (initialWindowEnd === 0 ? ageDays > 0 : ageDays > initialWindowEnd);
  const upcoming =
    Boolean(sowing && sowing > today) ||
    (input.status === "PLANNED" && !sowing);
  const stage =
    finished || upcoming
      ? null
      : validConfirmation && !staleEstablishment
        ? input.growthStage
        : estimatedStage;
  const basis = finished
    ? "COMPLETED"
    : upcoming
      ? "UPCOMING"
      : validConfirmation && !staleEstablishment
        ? "FARMER_CONFIRMED"
        : stage
          ? "CALENDAR_ESTIMATE"
          : "UNKNOWN";
  const source =
    basis === "CALENDAR_ESTIMATE"
      ? (stageProfile?.source ?? calendar?.source ?? null)
      : null;
  const sourceUrl =
    basis === "CALENDAR_ESTIMATE"
      ? (stageProfile?.sourceUrl ?? calendar?.sourceUrl ?? null)
      : null;
  const scope =
    basis === "CALENDAR_ESTIMATE"
      ? (stageProfile?.scope ?? calendar?.scope ?? null)
      : null;
  return {
    stage,
    ageDays,
    durationDays: duration,
    basis,
    confirmedAt: basis === "FARMER_CONFIRMED" ? confirmedAt : null,
    source,
    sourceUrl,
    scope,
    initialWindowEnd,
  };
}

export function cropAdviceExpectedHarvest(
  input: StageInput,
  today = indiaDateKey(new Date()),
) {
  if (
    input.actualHarvestDate ||
    ["HARVESTED", "COMPLETED"].includes(input.status)
  )
    return null;
  if (input.expectedHarvestDate) return indiaDateKey(input.expectedHarvestDate);
  const stage = cropAdviceStage(input, today);
  if (!input.sowingDate || !stage.durationDays) return null;
  return new Date(
    dayNumber(indiaDateKey(input.sowingDate)) + stage.durationDays * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
}
