import { test } from "node:test";
import assert from "node:assert/strict";
import { draftFromSoilText } from "../src/lib/soil-local-scan";
import { reviewNutritionWater } from "../src/lib/nutrition-water";
import { nutritionSampleSchema } from "../src/lib/nutrition-evidence";

test("local OCR only prefills explicit readings, original units and nutrient bases", () => {
  assert.deepEqual(draftFromSoilText("Laboratory: Synthetic Test Lab\nReport number: TEST-1\nN: 0 kg/ha\nP2O5: 10 kg/ha\nK: blurred"), {
    laboratoryName: "Synthetic Test Lab", reportNumber: "TEST-1", nitrogenKgHa: 0, phosphorusKgHa: 10, phosphorusBasis: "P2O5", nutrientUnit: "kg/ha",
  });
  assert.equal(draftFromSoilText("N: 1 kg/ha\nP: 20 mg/kg"), null);
  assert.equal(draftFromSoilText("P: 1 kg/ha\nP2O5: 1 kg/ha"), null);
});

test("FAO boron screening requires explicit concentration basis and a recorded analytical method", () => {
  const row = { parameter: "Boron", value: 3, unit: "mg/L", basis: "B", method: "Synthetic laboratory method" };
  const input = { group: "water", sampleId: "TEST", sampleLocation: "Synthetic source", sampleDate: "2026-01-01", laboratory: "Test laboratory", reportNumber: "TEST" };
  const screen = (reading: typeof row) => reviewNutritionWater(nutritionSampleSchema.parse({ ...input, measurements: [reading] }))?.boronScreen;
  assert.match(screen(row)?.status ?? "", /moderate/);
  assert.match(screen({ ...row, value: 3.01 })?.status ?? "", /Severe/);
  assert.equal(screen({ ...row, basis: "Boric acid" }), null);
  assert.equal(screen({ ...row, method: "Unknown" }), null);
});
