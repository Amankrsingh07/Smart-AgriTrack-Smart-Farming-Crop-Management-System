import assert from "node:assert/strict";
import test from "node:test";
import { calculateProductQuantities, theoreticalFertilizerBlend } from "../src/lib/fertilizer-blend";

test("theoretical blend conserves mass and counts DAP nitrogen once", () => {
  const result = theoreticalFertilizerBlend(100, { n: 20, p2o5: 23, k2o: 6 });
  assert.equal(result.status, "calculated");
  if (result.status !== "calculated") return;
  assert.equal(result.products.DAP, 50);
  assert.equal(result.products.Urea, 11 / 0.46);
  assert.equal(result.products.MOP, 10);
  assert.deepEqual(result.composition, { n: 20, p2o5: 23, k2o: 6 });
  assert.ok(Math.abs(Object.values(result.products).reduce((a, b) => a + b) + result.fillerKg - 100) < 1e-9);
});

test("theoretical blend rejects impossible targets and invalid inputs", () => {
  assert.equal(theoreticalFertilizerBlend(100, { n: 0, p2o5: 46, k2o: 0 }).status, "excess-nitrogen");
  assert.equal(theoreticalFertilizerBlend(100, { n: 50, p2o5: 0, k2o: 0 }).status, "excess-weight");
  assert.equal(theoreticalFertilizerBlend(100, { n: 40, p2o5: 40, k2o: 40 }).status, "invalid");
  assert.equal(theoreticalFertilizerBlend(0, { n: 20, p2o5: 20, k2o: 0 }).status, "invalid");
});

test("complex grades credit N and K₂O before calculating top-ups", () => {
  const result = theoreticalFertilizerBlend(100, { n: 10, p2o5: 26, k2o: 26 }, "NPK 10:26:26");
  assert.equal(result.status, "calculated");
  if (result.status !== "calculated") return;
  assert.deepEqual(result.products, { Urea: 0, "NPK 10:26:26": 100, MOP: 0 });
  assert.equal(result.fillerKg, 0);
  assert.equal(theoreticalFertilizerBlend(100, { n: 12, p2o5: 32, k2o: 8 }, "NPK 12:32:16").status, "nutrient-gap");
});

test("SSP and NPS report sulphur separately from the NPK target", () => {
  const ssp = theoreticalFertilizerBlend(100, { n: 0, p2o5: 8, k2o: 0 }, "SSP");
  assert.equal(ssp.status, "calculated");
  if (ssp.status === "calculated") assert.equal(ssp.sulphurPercent, 5.5);
  const nps = theoreticalFertilizerBlend(100, { n: 20, p2o5: 20, k2o: 0 }, "NPS 20:20:0:13");
  assert.equal(nps.status, "calculated");
  if (nps.status === "calculated") assert.equal(nps.sulphurPercent, 13);
});

test("field quantities report the phosphorus gap without exceeding the potassium limit", () => {
  const result = calculateProductQuantities({ n: 20, p2o5: 52, k2o: 26 }, "NPK 10:26:26");
  assert.ok(result);
  assert.deepEqual(result.supplied, { n: 20, p2o5: 26, k2o: 26 });
  assert.equal(result.phosphorusGapKg, 26);
  assert.equal(result.products["NPK 10:26:26"], 100);
  assert.equal(result.products.MOP, 0);
  assert.equal(calculateProductQuantities({ n: NaN, p2o5: 52, k2o: 26 }, "SSP"), null);
});
