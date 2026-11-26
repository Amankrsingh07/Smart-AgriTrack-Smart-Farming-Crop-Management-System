import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveCropCycleDisplayStatus,
  dateOnlyInIndia,
  indiaDateKey,
} from "../src/lib/crop-cycle-status";

const date = (day: number) =>
  new Date(`2026-11-${String(day).padStart(2, "0")}T12:00:00.000Z`);
const cycle = (
  overrides: Partial<{
    status: string;
    sowingDate: Date | null;
    expectedHarvestDate: Date | null;
    actualHarvestDate: Date | null;
  }> = {},
) => ({
  status: "ACTIVE",
  sowingDate: date(10),
  expectedHarvestDate: date(20),
  actualHarvestDate: null,
  ...overrides,
});

test("crop-cycle status follows India calendar dates without mutating a passed harvest date", () => {
  assert.equal(deriveCropCycleDisplayStatus(cycle(), date(9)), "UPCOMING");
  assert.equal(deriveCropCycleDisplayStatus(cycle(), date(15)), "GROWING");
  assert.equal(deriveCropCycleDisplayStatus(cycle(), date(20)), "HARVEST_DUE");
  assert.equal(
    deriveCropCycleDisplayStatus(cycle(), date(21)),
    "HARVEST_OVERDUE",
  );
  assert.equal(
    deriveCropCycleDisplayStatus(
      cycle({ status: "HARVESTED", actualHarvestDate: date(22) }),
      date(23),
    ),
    "HARVEST_COMPLETED",
  );
  assert.equal(
    deriveCropCycleDisplayStatus(cycle(), date(21)),
    "HARVEST_OVERDUE",
    "overdue stays overdue until farmer confirmation",
  );
});

test("missing dates do not invent a date-derived state and harvest dates are stored as date-only values", () => {
  assert.equal(
    deriveCropCycleDisplayStatus(
      cycle({ sowingDate: null, expectedHarvestDate: null }),
      date(15),
    ),
    null,
  );
  const d = new Date("2026-11-03T20:00:00.000Z");
  assert.equal(indiaDateKey(d), "2026-11-04");
  assert.equal(indiaDateKey(dateOnlyInIndia(d)), "2026-11-04");
});
