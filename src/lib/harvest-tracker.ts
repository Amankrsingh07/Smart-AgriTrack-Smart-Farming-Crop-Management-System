import { indiaDateKey } from "./crop-cycle-status";
import {
  countdownDays,
  expectedHarvestDate,
  harvestStatus,
  type HarvestCycleDates,
} from "./harvest";

type SavedCycle = HarvestCycleDates & {
  id: string;
  crop: NonNullable<HarvestCycleDates["crop"]> & { name: string };
  field: { name: string; farm: { name: string } };
  expectedHarvestQuantity: { toString(): string } | null;
  expectedHarvestUnit: string | null;
};

export function harvestTrackerEntry(cycle: SavedCycle, now: Date) {
  const expected = expectedHarvestDate(cycle);
  const sowingDate = cycle.sowingDate ? indiaDateKey(cycle.sowingDate) : null;
  const date = expected ? indiaDateKey(expected) : null;
  const days = countdownDays(cycle, now);
  const span =
    sowingDate && date
      ? (Date.parse(date) - Date.parse(sowingDate)) / 86_400_000
      : 0;
  return {
    id: cycle.id,
    crop: cycle.crop.name,
    farm: cycle.field.farm.name,
    field: cycle.field.name,
    sowingDate,
    growthStage: cycle.growthStage ?? null,
    date,
    days,
    progress:
      days !== null && span > 0
        ? Math.round(Math.max(0, Math.min(1, 1 - days / span)) * 100)
        : null,
    actualHarvestDate: cycle.actualHarvestDate
      ? indiaDateKey(cycle.actualHarvestDate)
      : null,
    expectedHarvestQuantity: cycle.expectedHarvestQuantity?.toString() ?? null,
    expectedHarvestUnit: cycle.expectedHarvestUnit,
    status: harvestStatus(cycle, now),
    href: `/crops#cycle-${encodeURIComponent(cycle.id)}`,
  };
}

export type HarvestTrackerEntry = ReturnType<typeof harvestTrackerEntry>;
