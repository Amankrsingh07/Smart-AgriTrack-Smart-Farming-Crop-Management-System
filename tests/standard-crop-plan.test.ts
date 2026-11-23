import test from "node:test";
import assert from "node:assert/strict";
import { buildStandardCropPlan } from "../src/lib/standard-crop-plan";
import { scientificDoses } from "../src/lib/scientific-dose-registry";
import { getIcarRecipes } from "../src/lib/icar-fertilizer";

test("source-scoped Rabi records calculate only for their region and require farmer confirmation", () => {
  assert.equal(scientificDoses.length, 5);
  assert.deepEqual(getIcarRecipes("Wheat", "Bihar", "Patna"), []);
  const input = { crop: "Mustard", state: "Haryana", district: "Hisar", season: "RABI" as const, soilType: "Alluvial", growthStage: "Sowing", fieldAreaHa: 1 };
  assert.equal(buildStandardCropPlan(input, undefined, { season: "RABI" }).calculation, null);
  const plan = buildStandardCropPlan(input, "icar-rabi-irrigated-mustard-haryana", { season: "RABI", publicationConditionsConfirmed: true });
  assert.equal(plan.calculation?.total.ssp, 187.5);
  assert.equal(plan.calculation?.total.urea, 80 / 0.46);
  assert.equal(plan.calendar.supported, true);
});
