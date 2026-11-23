import test from "node:test";
import assert from "node:assert/strict";
import { nutritionSampleSchema } from "../src/lib/nutrition-evidence";
import { reviewNutritionWater, comparableNutritionMeasurements } from "../src/lib/nutrition-water";
import { soilHealthSchema } from "../src/lib/soil-health-validation";
import { dashboardSoilInput } from "../src/lib/fertilizer-dashboard";

const measurement = (parameter: string, value: number) => ({ parameter, value, unit: "meq/L", basis: "Dissolved ion", method: "Synthetic method" });
const water = { group: "water" as const, sampleId: "SYNTHETIC-WATER", sampleDate: "2026-01-01", sampleLocation: "Test source", sourceOrPart: "Test borewell", laboratory: "Synthetic lab", reportNumber: "DEMO-W01",
  measurements: [measurement("Sodium", 4), measurement("Calcium", 3), measurement("Magnesium", 1), measurement("Carbonate", 0), measurement("Bicarbonate", 2)] };

test("water SAR and RSC use compatible same-sample ions and preserve signed balances", () => {
  const review = reviewNutritionWater(nutritionSampleSchema.parse(water));
  assert.equal(review?.sar, 4 / Math.sqrt(2));
  assert.equal(review?.rsc, -2);
  assert.equal(review?.screening.waterStatus, "Insufficient data");
  const incompatible = { ...water, measurements: water.measurements.map(row => row.parameter === "Magnesium" ? { ...row, unit: "mg/L" } : row) };
  assert.equal(reviewNutritionWater(incompatible)?.sar, null);
  assert.equal(reviewNutritionWater(incompatible)?.rsc, null);
  assert.equal(reviewNutritionWater({ ...water, measurements: water.measurements.filter(row => row.parameter !== "Carbonate") })?.rsc, null);
});

test("soil, water and tissue have separate registries and comparable trends require consistent lab evidence", () => {
  assert.equal(nutritionSampleSchema.safeParse({ ...water, group: "tissue" }).success, false);
  assert.equal(nutritionSampleSchema.safeParse({ ...water, measurements: [...water.measurements, water.measurements[0]] }).success, false);
  assert.equal(comparableNutritionMeasurements(water, { ...water, sampleDate: "2026-03-01" }).length, 5);
  assert.deepEqual(comparableNutritionMeasurements(water, { ...water, sampleLocation: "Different", sampleDate: "2026-03-01" }), []);
  const properties = { ...water, group: "properties", measurements: [{ parameter: "Organic matter", value: 2.5, unit: "%" }] };
  assert.equal(nutritionSampleSchema.safeParse(properties).success, true);
});

test("water-only samples are persisted as evidence but cannot act as a soil report", () => {
  const input = soilHealthSchema.parse({ mode: "REAL", state: "Bihar", district: "Saran", crop: "Wheat", soilType: "Alluvial", growthStage: "Vegetative", fieldId: "sample-field", nutritionSamples: [water] });
  assert.equal(dashboardSoilInput({ fieldId: "sample-field", input, result: {} }, input), null);
});

test("advanced trends group only comparable owned field evidence and exclude demo data", async () => {
  const { advancedNutritionTrends } = await import("../src/lib/nutrition-trends");
  const base = soilHealthSchema.parse({ mode: "REAL", state: "Bihar", district: "Saran", crop: "Wheat", soilType: "Alluvial", growthStage: "Vegetative", fieldId: "field", nutritionSamples: [water] });
  const row = (id: string, sampleDate: string, sampleLocation = water.sampleLocation, synthetic = false) => ({
    id, createdAt: sampleDate, input: { ...base, nutritionSamples: [{ ...water, sampleDate, sampleLocation }] }, result: { synthetic },
  });
  const trends = advancedNutritionTrends([row("one", "2026-01-01"), row("two", "2026-02-01"), row("wrong-source", "2026-03-01", "Other"), row("demo", "2026-04-01", water.sampleLocation, true)], "field");
  assert.equal(trends.length, 5);
  assert.ok(trends.every(group => group.points.length === 2 && group.points[1].date === "2026-02-01"));
  assert.deepEqual(advancedNutritionTrends([row("one", "2026-01-01"), row("two", "2026-02-01")], "different-field"), []);
});
