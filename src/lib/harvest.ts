import { indiaDateKey, isCropCycleFinished } from "./crop-cycle-status";

export type HarvestCycleDates = {
  status: string;
  sowingDate?: Date | null;
  expectedHarvestDate?: Date | null;
  actualHarvestDate?: Date | null;
  cropDurationDays?: number | null;
  growthStage?: string | null;
  growthStageUpdatedAt?: Date | null;
  crop?: { climateRequirement?: { cropDurationDays?: number | null } | null };
};

/** Keeps an explicit calendar date authoritative; otherwise estimates from the configured crop duration and the date the farmer recorded the current growth stage. */
export function expectedHarvestDate(cycle: HarvestCycleDates): Date | null {
  if (cycle.expectedHarvestDate) return dateOnly(cycle.expectedHarvestDate);
  const duration =
    cycle.cropDurationDays ?? cycle.crop?.climateRequirement?.cropDurationDays;
  if (
    !cycle.sowingDate ||
    !duration ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 730
  )
    return null;
  const key = indiaDateKey(cycle.sowingDate);
  const [year, month, day] = key.split("-").map(Number);
  const sowing = new Date(Date.UTC(year, month - 1, day));
  // Indicative phase progress anchors only; source-profile duration remains crop-specific and farmers can edit the duration.
  const stageProgress: Record<string, number> = {
    Establishment: 0.1,
    Vegetative: 0.3,
    Flowering: 0.55,
    "Fruit / grain formation": 0.8,
    Maturity: 1,
  };
  const progress = cycle.growthStage
    ? stageProgress[cycle.growthStage]
    : undefined;
  if (progress !== undefined && cycle.growthStageUpdatedAt) {
    const stageKey = indiaDateKey(cycle.growthStageUpdatedAt);
    const [stageYear, stageMonth, stageDay] = stageKey.split("-").map(Number);
    const stageDate = new Date(Date.UTC(stageYear, stageMonth - 1, stageDay));
    const anchor = stageDate < sowing ? sowing : stageDate;
    return new Date(
      anchor.getTime() + Math.ceil(duration * (1 - progress)) * 86_400_000,
    );
  }
  return new Date(sowing.getTime() + duration * 86_400_000);
}

export type HarvestStatus =
  | "UPCOMING"
  | "READY"
  | "DUE_TODAY"
  | "OVERDUE"
  | "HARVESTED";
export function harvestStatus(
  cycle: HarvestCycleDates,
  now = new Date(),
): HarvestStatus | null {
  if (isCropCycleFinished(cycle)) return "HARVESTED";
  const date = expectedHarvestDate(cycle);
  if (!date) return null;
  const today = indiaDateKey(now);
  const expected = date.toISOString().slice(0, 10);
  if (expected === today) return "DUE_TODAY";
  if (expected < today) return "OVERDUE";
  const remainingDays = Math.ceil(
    (Date.parse(`${expected}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  return remainingDays <= 7 ? "READY" : "UPCOMING";
}

export function countdownDays(
  cycle: HarvestCycleDates,
  now = new Date(),
): number | null {
  if (isCropCycleFinished(cycle)) return null;
  const date = expectedHarvestDate(cycle);
  if (!date) return null;
  return Math.ceil(
    (Date.parse(date.toISOString().slice(0, 10) + "T00:00:00Z") -
      Date.parse(indiaDateKey(now) + "T00:00:00Z")) /
      86_400_000,
  );
}

export function calculateYieldPerAcre(
  quantity: number,
  unit: string,
  fieldArea: number,
  areaUnit: string,
): number | null {
  const kgPerUnit: Record<string, number> = {
    kg: 1,
    kilogram: 1,
    quintal: 100,
    tonne: 1000,
    ton: 1000,
  };
  const factor = kgPerUnit[unit.trim().toLowerCase()];
  const unitKey = areaUnit.trim().toLowerCase();
  const areaAcres =
    unitKey === "hectare" || unitKey === "ha"
      ? fieldArea * 2.47105
      : unitKey === "acre"
        ? fieldArea
        : NaN;
  if (
    !factor ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(areaAcres) ||
    areaAcres <= 0
  )
    return null;
  return (quantity * factor) / areaAcres;
}

function dateOnly(date: Date) {
  const [year, month, day] = indiaDateKey(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
