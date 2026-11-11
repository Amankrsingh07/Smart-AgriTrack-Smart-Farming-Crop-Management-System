import test from "node:test";
import assert from "node:assert/strict";
import { calculateEffectiveRainfall, projectRootZoneDepletion, rainfallCreditEligibility, rainfallTransactionFingerprint } from "../src/lib/rainfall-water-balance";
import { calculateSimpleIrrigation } from "../src/lib/simple-irrigation-planner";

test("zero and 10 mm observed rainfall calculate with explicit runoff and storage", () => {
  assert.deepEqual(calculateEffectiveRainfall({ grossRainfallMm: 0, runoffLossMm: 0, fieldCapacityPercent: 30, currentMoisturePercent: 20, rootZoneDepthM: 0.5 }), { effectiveRainfallMm: 0, drainageLossMm: 0, status: "ESTIMATED_MEASURED_RUNOFF_AND_ROOT_STORAGE" });
  const ten = calculateEffectiveRainfall({ grossRainfallMm: 10, runoffLossMm: 0, fieldCapacityPercent: 30, currentMoisturePercent: 20, rootZoneDepthM: 0.5 });
  assert.equal(ten.effectiveRainfallMm, 10);
  assert.equal(ten.drainageLossMm, 0);
});

test("30 mm rainfall accounts for measured runoff and excess root-zone drainage", () => {
  const result = calculateEffectiveRainfall({ grossRainfallMm: 30, runoffLossMm: 2, fieldCapacityPercent: 25, currentMoisturePercent: 24, rootZoneDepthM: 1 });
  assert.equal(result.effectiveRainfallMm, 10);
  assert.equal(result.drainageLossMm, 18);
});

test("missing runoff or root-zone measurements withholds effective rainfall", () => {
  assert.equal(calculateEffectiveRainfall({ grossRainfallMm: 10, fieldCapacityPercent: 30, currentMoisturePercent: 20, rootZoneDepthM: 0.5 }).effectiveRainfallMm, null);
});

test("rainfall retries are idempotent by transaction ID while separate same-day observations remain distinct", () => {
  const original = { transactionId: "rain-1", userId: "user-1", cropCycleId: "cycle-1", rainfallDate: "2026-11-06", moistureMeasuredDate: "2026-11-05", grossRainfallMm: 10, source: "MANUAL_OBSERVATION", runoffLossMm: 0, fieldCapacityPercent: 30, currentPercent: 20, rootZoneDepthM: 0.5, notes: "north field" };
  const repeated = { ...original, notes: " north field " };
  const anotherObservation = { ...original, transactionId: "rain-2" };
  assert.equal(rainfallTransactionFingerprint(original), rainfallTransactionFingerprint(repeated));
  assert.notEqual(rainfallTransactionFingerprint(original), rainfallTransactionFingerprint(anotherObservation));
});

test("post-reading observed rainfall is eligible and lowers planner depletion", () => {
  const eligibility = rainfallCreditEligibility({ source: "MANUAL_OBSERVATION", rainfallDate: "2026-11-06", moistureMeasuredDate: "2026-11-05", today: "2026-11-07" });
  assert.equal(eligibility, "ELIGIBLE");
  const estimate = calculateEffectiveRainfall({ grossRainfallMm: 40, runoffLossMm: 5, fieldCapacityPercent: 23, currentMoisturePercent: 15, rootZoneDepthM: 1 });
  assert.ok((estimate.effectiveRainfallMm ?? 0) > 0);
  const common = {
    crop: "Wheat", state: "Andaman And Nicobar Islands", district: "North And Middle Andaman", area: 1, areaUnit: "hectare",
    growthStage: "Flowering", soil: "Loamy Soil", method: "Drip Irrigation", month: 11,
    moisture: { fieldCapacityPercent: 23, wiltingPointPercent: 11, currentPercent: 15, rootZoneDepthM: 1 },
    moistureMeasuredDate: "2026-11-05", calculationDate: "2026-11-07",
  };
  const withoutRain = calculateSimpleIrrigation(common);
  const withRain = calculateSimpleIrrigation({ ...common, rainfallEvents: [{ date: "2026-11-06", grossMm: 40, effectiveMm: estimate.effectiveRainfallMm, source: "MANUAL_OBSERVATION", moistureMeasuredDate: "2026-11-05" }] });
  assert.ok((withRain.effectiveRainfallMm ?? 0) > 0);
  assert.ok((withRain.depletionMm ?? Infinity) < (withoutRain.depletionMm ?? -Infinity));
});

test("rainfall on the moisture reading date is ineligible", () => {
  assert.equal(rainfallCreditEligibility({ source: "MANUAL_OBSERVATION", rainfallDate: "2026-11-05", moistureMeasuredDate: "2026-11-05", today: "2026-11-07" }), "ALREADY_REFLECTED_OR_AMBIGUOUS_DATE");
});

test("forecast rainfall is never eligible for observed-rain credit", () => {
  assert.equal(rainfallCreditEligibility({ source: "FORECAST", rainfallDate: "2026-11-06", moistureMeasuredDate: "2026-11-05", today: "2026-11-07" }), "FORECAST_ONLY_NOT_CREDITED");
});

test("rain recorded against a different moisture date is not credited", () => {
  const status = rainfallCreditEligibility({ source: "MANUAL_OBSERVATION", rainfallDate: "2026-11-06", moistureMeasuredDate: "2026-11-04", recordedMoistureMeasuredDate: "2026-11-05", today: "2026-11-07" });
  assert.equal(status, "MOISTURE_DATE_MISMATCH");
  const balance = projectRootZoneDepletion({ measuredDepletionMm: 60, tawMm: 100, etcMmPerDay: 5, moistureMeasuredDate: "2026-11-04", calculationDate: "2026-11-06", rainfallEvents: [{ date: "2026-11-06", grossMm: 40, effectiveMm: 35, source: "MANUAL_OBSERVATION", moistureMeasuredDate: "2026-11-05" }] });
  assert.equal(balance.effectiveRainfallMm, 0);
});

test("forecast and climate normals never receive rainfall credit", () => {
  const result = projectRootZoneDepletion({ measuredDepletionMm: 20, tawMm: 100, etcMmPerDay: 5, moistureMeasuredDate: "2026-11-05", calculationDate: "2026-11-06", rainfallEvents: [
    { date: "2026-11-06", grossMm: 15, effectiveMm: 15, source: "FORECAST", moistureMeasuredDate: "2026-11-05" },
    { date: "2026-11-06", grossMm: 40, effectiveMm: 40, source: "HISTORICAL_NORMAL", moistureMeasuredDate: "2026-11-05" },
  ] });
  assert.equal(result.grossRainfallMm, 0);
  assert.equal(result.effectiveRainfallMm, 0);
  assert.equal(result.depletionMm, 25);
});

test("rain on or before the moisture measurement date is excluded from the balance", () => {
  const result = projectRootZoneDepletion({ measuredDepletionMm: 50, tawMm: 100, etcMmPerDay: 4, moistureMeasuredDate: "2026-11-06", calculationDate: "2026-11-06", rainfallEvents: [
    { date: "2026-11-06", grossMm: 10, effectiveMm: 10, source: "MANUAL_OBSERVATION", moistureMeasuredDate: "2026-11-06" },
  ] });
  assert.equal(result.effectiveRainfallMm, 0);
  assert.equal(result.depletionMm, 50);
});

test("10 and 30 mm post-reading observations reduce depletion over a one-day balance", () => {
  const common = { measuredDepletionMm: 60, tawMm: 100, etcMmPerDay: 5, moistureMeasuredDate: "2026-11-05", calculationDate: "2026-11-06" };
  const ten = projectRootZoneDepletion({ ...common, rainfallEvents: [{ date: "2026-11-06", grossMm: 10, effectiveMm: 10, source: "WEATHER_STATION", moistureMeasuredDate: common.moistureMeasuredDate }] });
  const thirty = projectRootZoneDepletion({ ...common, rainfallEvents: [{ date: "2026-11-06", grossMm: 30, effectiveMm: 20, source: "MANUAL_OBSERVATION", moistureMeasuredDate: common.moistureMeasuredDate }] });
  assert.equal(ten.grossRainfallMm, 10);
  assert.equal(ten.effectiveRainfallMm, 10);
  assert.equal(ten.depletionMm, 55);
  assert.equal(thirty.grossRainfallMm, 30);
  assert.equal(thirty.effectiveRainfallMm, 20);
  assert.equal(thirty.depletionMm, 45);
});

test("offline planner reports observed gross/effective rainfall and rolls measured depletion forward", () => {
  const result = calculateSimpleIrrigation({
    crop: "Wheat", state: "Andaman And Nicobar Islands", district: "North And Middle Andaman", area: 1, areaUnit: "hectare",
    growthStage: "Flowering", soil: "Loamy Soil", method: "Drip Irrigation", month: 1,
    moisture: { fieldCapacityPercent: 32, wiltingPointPercent: 15, currentPercent: 22, rootZoneDepthM: 0.6 },
    moistureMeasuredDate: "2026-11-05", calculationDate: "2026-11-06",
    rainfallEvents: [{ date: "2026-11-06", grossMm: 10, effectiveMm: 10, source: "MANUAL_OBSERVATION", moistureMeasuredDate: "2026-11-05" }],
  });
  assert.equal(result.grossRainfallMm, 10);
  assert.equal(result.effectiveRainfallMm, 10);
  assert.equal(result.depletionMm, 60 - 10 + (result.etcMaxMmPerDay ?? 0));
  assert.equal(result.rainfallSource, "MANUAL_OBSERVATION");
});

test("different soil storage and crops are applied as separate parameters, not rainfall multipliers", () => {
  const sandy = calculateEffectiveRainfall({ grossRainfallMm: 30, runoffLossMm: 5, fieldCapacityPercent: 22, currentMoisturePercent: 20, rootZoneDepthM: 0.3 });
  const clay = calculateEffectiveRainfall({ grossRainfallMm: 30, runoffLossMm: 2, fieldCapacityPercent: 35, currentMoisturePercent: 25, rootZoneDepthM: 0.6 });
  assert.equal(sandy.effectiveRainfallMm, 6);
  assert.equal(sandy.drainageLossMm, 19);
  assert.equal(clay.effectiveRainfallMm, 28);
  const input = { state: "Andaman And Nicobar Islands", district: "North And Middle Andaman", area: 1, areaUnit: "hectare", growthStage: "Vegetative", soil: "Sandy Loam", method: "Drip Irrigation", month: 1, moisture: { fieldCapacityPercent: 32, wiltingPointPercent: 15, currentPercent: 22, rootZoneDepthM: 0.6 }, moistureMeasuredDate: "2026-11-05", calculationDate: "2026-11-06", rainfallEvents: [{ date: "2026-11-06", grossMm: 10, effectiveMm: 10, source: "MANUAL_OBSERVATION", moistureMeasuredDate: "2026-11-05" }] };
  const millet = calculateSimpleIrrigation({ ...input, crop: "Millet" });
  const barley = calculateSimpleIrrigation({ ...input, crop: "Barley" });
  assert.equal(millet.effectiveRainfallMm, barley.effectiveRainfallMm);
  assert.notEqual(millet.etcMaxMmPerDay, barley.etcMaxMmPerDay);
  assert.notEqual(millet.depletionMm, barley.depletionMm);
});
