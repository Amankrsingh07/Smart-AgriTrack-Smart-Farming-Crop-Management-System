import test from "node:test";
import assert from "node:assert/strict";
import { calculateYieldPerAcre, countdownDays, expectedHarvestDate, harvestStatus } from "../src/lib/harvest";

test("derives an expected harvest from sowing date and configured crop duration", () => {
  const date = expectedHarvestDate({ status: "ACTIVE", sowingDate: new Date("2026-01-01T00:00:00Z"), expectedHarvestDate: null, cropDurationDays: 120 });
  assert.equal(date?.toISOString().slice(0, 10), "2026-05-01");
});

test("explicit expected date takes precedence over a duration estimate", () => {
  const date = expectedHarvestDate({ status: "ACTIVE", sowingDate: new Date("2026-01-01T00:00:00Z"), expectedHarvestDate: new Date("2026-03-01T00:00:00Z"), cropDurationDays: 120 });
  assert.equal(date?.toISOString().slice(0, 10), "2026-03-01");
});

test("reports upcoming, ready, due, overdue and harvested states using India calendar days", () => {
  const cycle = { status: "ACTIVE", sowingDate: null, expectedHarvestDate: new Date("2026-11-10T00:00:00Z"), cropDurationDays: null };
  assert.equal(harvestStatus(cycle, new Date("2026-11-01T12:00:00Z")), "UPCOMING");
  assert.equal(harvestStatus(cycle, new Date("2026-11-05T12:00:00Z")), "READY");
  assert.equal(harvestStatus(cycle, new Date("2026-11-10T12:00:00Z")), "DUE_TODAY");
  assert.equal(harvestStatus(cycle, new Date("2026-11-11T12:00:00Z")), "OVERDUE");
  assert.equal(harvestStatus({ ...cycle, status: "HARVESTED" }), "HARVESTED");
  assert.equal(countdownDays(cycle, new Date("2026-11-05T12:00:00Z")), 5);
});

test("updates the crop-specific duration estimate when the farmer records a new growth stage", () => {
  const cycle = { status: "ACTIVE", sowingDate: new Date("2026-01-01T00:00:00Z"), expectedHarvestDate: null, cropDurationDays: 100, growthStage: "Flowering", growthStageUpdatedAt: new Date("2026-03-01T12:00:00Z") };
  assert.equal(expectedHarvestDate(cycle)?.toISOString().slice(0, 10), "2026-04-15");
  assert.equal(harvestStatus(cycle, new Date("2026-04-10T12:00:00Z")), "READY");
});

test("converts saved harvest quantity and field area to kg per acre when units are supported", () => {
  assert.equal(calculateYieldPerAcre(10, "quintal", 2, "acre"), 500);
  assert.equal(calculateYieldPerAcre(100, "kg", 1, "hectare"), 100 / 2.47105);
  assert.equal(calculateYieldPerAcre(4, "bag", 1, "acre"), null);
});
