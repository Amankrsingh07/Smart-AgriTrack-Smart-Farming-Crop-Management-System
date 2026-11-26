import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateYieldPerAcre,
  countdownDays,
  expectedHarvestDate,
  harvestStatus,
} from "../src/lib/harvest";

test("derives an expected harvest from sowing date and configured crop duration", () => {
  const date = expectedHarvestDate({
    status: "ACTIVE",
    sowingDate: new Date("2026-01-01T00:00:00Z"),
    expectedHarvestDate: null,
    cropDurationDays: 120,
  });
  assert.equal(date?.toISOString().slice(0, 10), "2026-05-01");
});

test("explicit expected date takes precedence over a duration estimate", () => {
  const date = expectedHarvestDate({
    status: "ACTIVE",
    sowingDate: new Date("2026-01-01T00:00:00Z"),
    expectedHarvestDate: new Date("2026-03-01T00:00:00Z"),
    cropDurationDays: 120,
  });
  assert.equal(date?.toISOString().slice(0, 10), "2026-03-01");
});

test("reports upcoming, ready, due, overdue and harvested states using India calendar days", () => {
  const cycle = {
    status: "ACTIVE",
    sowingDate: null,
    expectedHarvestDate: new Date("2026-11-10T00:00:00Z"),
    cropDurationDays: null,
  };
  assert.equal(
    harvestStatus(cycle, new Date("2026-11-01T12:00:00Z")),
    "UPCOMING",
  );
  assert.equal(harvestStatus(cycle, new Date("2026-11-05T12:00:00Z")), "READY");
  assert.equal(
    harvestStatus(cycle, new Date("2026-11-10T12:00:00Z")),
    "DUE_TODAY",
  );
  assert.equal(
    harvestStatus(cycle, new Date("2026-11-11T12:00:00Z")),
    "OVERDUE",
  );
  assert.equal(harvestStatus({ ...cycle, status: "HARVESTED" }), "HARVESTED");
  assert.equal(countdownDays(cycle, new Date("2026-11-05T12:00:00Z")), 5);
});

test("updates the crop-specific duration estimate when the farmer records a new growth stage", () => {
  const cycle = {
    status: "ACTIVE",
    sowingDate: new Date("2026-01-01T00:00:00Z"),
    expectedHarvestDate: null,
    cropDurationDays: 100,
    growthStage: "Flowering",
    growthStageUpdatedAt: new Date("2026-03-01T12:00:00Z"),
  };
  assert.equal(
    expectedHarvestDate(cycle)?.toISOString().slice(0, 10),
    "2026-04-15",
  );
  assert.equal(harvestStatus(cycle, new Date("2026-04-10T12:00:00Z")), "READY");
});

test("converts saved harvest quantity and field area to kg per acre when units are supported", () => {
  assert.equal(calculateYieldPerAcre(10, "quintal", 2, "acre"), 500);
  assert.equal(calculateYieldPerAcre(100, "kg", 1, "hectare"), 100 / 2.47105);
  assert.equal(calculateYieldPerAcre(4, "bag", 1, "acre"), null);
});

test("completed cycles do not count down and unknown legacy area units produce no yield", () => {
  const cycle = {
    status: "COMPLETED",
    expectedHarvestDate: new Date("2026-11-10T00:00:00Z"),
  };
  assert.equal(harvestStatus(cycle), "HARVESTED");
  assert.equal(countdownDays(cycle), null);
  assert.equal(calculateYieldPerAcre(200, "kg", 2, "bigha"), null);
});

test("tracker retains incomplete crops and derives progress and status from saved dates", async () => {
  const { harvestTrackerEntry } = await import("../src/lib/harvest-tracker");
  const now = new Date("2026-04-10T19:00:00Z");
  const cycle = {
    id: "cycle",
    status: "PLANNED",
    crop: { name: "Wheat", climateRequirement: { cropDurationDays: 100 } },
    field: { name: "North", farm: { name: "Farm" } },
    expectedHarvestQuantity: null,
    expectedHarvestUnit: null,
  };
  const missing = harvestTrackerEntry(cycle, now);
  assert.equal(missing.date, null);
  assert.equal(missing.status, null);
  assert.equal(missing.progress, null);
  assert.equal(missing.href, "/crops#cycle-cycle");

  const sowingDate = new Date("2026-01-01T18:30:00Z");
  const estimated = harvestTrackerEntry({ ...cycle, sowingDate }, now);
  assert.equal(estimated.sowingDate, "2026-01-02");
  assert.equal(estimated.date, "2026-04-12");
  assert.equal(estimated.days, 1);
  assert.equal(estimated.status, "READY");
  assert.equal(estimated.progress, 99);

  const expectedHarvestDate = new Date("2026-04-10");
  const overdue = harvestTrackerEntry(
    { ...cycle, status: "ACTIVE", sowingDate, expectedHarvestDate },
    now,
  );
  assert.equal(overdue.date, "2026-04-10");
  assert.equal(overdue.days, -1);
  assert.equal(overdue.status, "OVERDUE");
  assert.equal(overdue.progress, 100);

  const finished = harvestTrackerEntry(
    { ...cycle, status: "COMPLETED", actualHarvestDate: expectedHarvestDate },
    now,
  );
  assert.equal(finished.status, "HARVESTED");
  assert.equal(finished.actualHarvestDate, "2026-04-10");
  assert.equal(finished.days, null);
});
