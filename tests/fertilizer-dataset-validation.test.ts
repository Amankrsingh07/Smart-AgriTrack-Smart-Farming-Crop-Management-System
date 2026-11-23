import test from "node:test";
import assert from "node:assert/strict";
import dataset from "../src/data/fertilizer/regional-packages.json";
import { regionalDatasetSchema } from "../src/lib/fertilizer-dataset-validation";
import { getIcarRecipes, calculateIcarFertilizer } from "../src/lib/icar-fertilizer";

test("verified regional mustard records have complete source and scope metadata", () => {
  const parsed = regionalDatasetSchema.safeParse(dataset);
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  if (parsed.success) {
    assert.equal(parsed.data.records.length, 4);
    assert.deepEqual(parsed.data.records.map(row => row.state).sort(), ["Delhi", "Delhi", "Haryana", "Haryana"]);
    assert.ok(parsed.data.records.every(row => row.season === "RABI" && row.irrigationCondition === "IRRIGATED" && row.district === null));
    assert.ok(parsed.data.records.filter(row => row.cropKey === "mustard").every(row => row.nutrientsKgHa.n === 80 && row.nutrientsKgHa.p2o5 === 30 && row.nutrientsKgHa.k2o === 20));
    assert.ok(parsed.data.records.filter(row => row.cropKey === "wheat").every(row => row.nutrientsKgHa.n === 150 && row.nutrientsKgHa.p2o5 === 60 && row.nutrientsKgHa.k2o === 30));
  }
  const options = getIcarRecipes("Mustard", "Haryana", "", { season: "RABI", irrigationCondition: "IRRIGATED", includeConfirmationOptions: true });
  assert.equal(options.length, 1);
  const plan = calculateIcarFertilizer(options[0], 2);
  assert.ok(Math.abs(plan.total.urea - (160 / 0.46)) < 1e-8);
  assert.equal(plan.total.ssp, 375);
  assert.ok(Math.abs(plan.total.mop - (40 / 0.60)) < 1e-8);
  assert.equal(plan.schedule[0].ssp, 375);
  assert.ok(Math.abs(plan.schedule[0].urea - (80 / 0.46)) < 1e-8);
  assert.ok(Math.abs(plan.schedule[1].urea - (80 / 0.46)) < 1e-8);
});
