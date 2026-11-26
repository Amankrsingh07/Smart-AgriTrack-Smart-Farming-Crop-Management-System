import test from "node:test";
import assert from "node:assert/strict";
import { assessRecordedNutritionPlan } from "../src/lib/nutrition-plan-risk";

test("balance uses owned-plan applied records and exact decimal product nutrient contributions", () => {
  const plan = { id: "plan", result: { total: { n: 1, p2o5: 0, k2o: 0 } } };
  const row = {
    status: "APPLIED",
    quantityKg: "3.1",
    planId: "plan",
    composition: { n: 0.46, p2o5: 0, k2o: 0 },
  };
  assert.deepEqual(
    assessRecordedNutritionPlan(plan, [
      row,
      { ...row, status: "PLANNED" },
    ])?.[0],
    {
      nutrient: "n",
      targetKg: "1",
      recordedKg: "1.426",
      balanceKg: "-0.426",
      exceeds: true,
    },
  );
  assert.equal(assessRecordedNutritionPlan(plan, []), null);
  assert.equal(
    assessRecordedNutritionPlan(plan, [{ ...row, planId: "other" }]),
    null,
  );
  assert.equal(
    assessRecordedNutritionPlan(plan, [{ ...row, composition: {} }]),
    null,
  );
});
