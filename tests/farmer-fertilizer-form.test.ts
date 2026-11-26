import assert from "node:assert/strict";
import { test } from "node:test";
import {
  farmerSoilPayload,
  fertilizerAreaHa,
  type FarmerSoilForm,
} from "../src/lib/farmer-fertilizer-form";
import { soilHealthSchema } from "../src/lib/soil-health-validation";
import { analyzeSoil } from "../src/lib/soil-health";
import {
  calculateIcarFertilizer,
  getIcarRecipes,
} from "../src/lib/icar-fertilizer";
import { draftFromSoilText } from "../src/lib/soil-local-scan";

const values: FarmerSoilForm = {
  crop: "Wheat",
  growthStage: "Vegetative",
  soilType: "",
  state: "Bihar",
  district: "Saran",
  season: "RABI",
  nitrogenValue: "",
  phosphorusValue: "0",
  potassiumValue: "",
  soilPh: "",
  phosphorusUnit: "ppm",
};

test("blank report fields stay unknown and a measured zero with an incompatible unit is preserved", () => {
  const payload = farmerSoilPayload(values, 1);
  assert.equal(payload.soilType, "Unknown");
  assert.equal(payload.nitrogenValue, undefined);
  assert.equal(payload.potassiumValue, undefined);
  assert.equal(payload.phosphorusValue, 0);
  const result = analyzeSoil(soilHealthSchema.parse(payload));
  assert.deepEqual(
    result.nutrients.map((value) => [value.value, value.rating]),
    [
      [null, "Unknown"],
      [0, "Unknown"],
      [null, "Unknown"],
    ],
  );
  assert.equal(result.nutrients[1].unit, "ppm");
});

test("acres scale a verified Saran wheat standard and unmatched seasons and districts produce no recipe", () => {
  const acre = fertilizerAreaHa("1", "acre")!;
  const recipe = getIcarRecipes("Wheat", "Bihar", "Saran", {
    season: "RABI",
    includeConfirmationOptions: true,
  })[0];
  assert.ok(recipe?.scientificRecord);
  const plan = calculateIcarFertilizer(recipe, acre);
  assert.equal(plan.total.urea, plan.perHa.urea * 0.40468564224);
  assert.equal(fertilizerAreaHa("1", "hectare"), 1);
  assert.equal(fertilizerAreaHa("", "acre"), null);
  assert.equal(fertilizerAreaHa("Infinity", "hectare"), null);
  assert.equal(
    getIcarRecipes("Wheat", "Bihar", "Saran", { season: "KHARIF" }).length,
    0,
  );
  assert.equal(
    getIcarRecipes("Wheat", "Bihar", "Patna", { season: "RABI" }).length,
    0,
  );
});

test("OCR extracts explicit pH and only a clearly labeled supported method", () => {
  assert.deepEqual(draftFromSoilText("pH: 7.2\npH method: Soil:Water 1:2.5"), {
    soilPh: 7.2,
    phMethod: "WATER_1_2_5",
  });
  assert.deepEqual(draftFromSoilText("pH: 7.2"), { soilPh: 7.2 });
  assert.equal(draftFromSoilText("pH: 7.2\npH: 8.0"), null);
});
