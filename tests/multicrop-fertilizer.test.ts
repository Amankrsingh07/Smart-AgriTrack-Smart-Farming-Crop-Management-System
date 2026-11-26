import test from "node:test";
import assert from "node:assert/strict";
import {
  scientificDoses,
  registryRecipe,
} from "../src/lib/scientific-dose-registry";
import {
  fertilizerCrops,
  fertilizerCropKey,
  fertilizerCoverageTargets,
} from "../src/lib/fertilizer-crop-registry";
import { calculateFertilizerDemo } from "../src/lib/fertilizer-demo-calculation";
import { verifiedFertilizerProducts as grades } from "../src/lib/fertilizer-product-grades";
import type { SoilHealthInput } from "../src/lib/soil-health";
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test("coverage target includes the complete original list, aliases and live custom crop IDs", () => {
  assert.ok(fertilizerCrops.length > 29);
  for (const crop of [
    "Lentil",
    "Sunflower",
    "Jute",
    "Turmeric",
    "Ginger",
    "Banana",
    "Mango",
  ])
    assert.ok(fertilizerCropKey(crop));
  assert.notEqual(
    fertilizerCropKey("Millet"),
    fertilizerCropKey("Pearl millet"),
  );
  assert.notEqual(
    fertilizerCropKey("Millet"),
    fertilizerCropKey("Finger millet"),
  );
  const rows = fertilizerCoverageTargets([
    { id: "real-crop-id", name: "Chickpea" },
    { id: "rice-real", name: "Rice (Paddy)" },
    { id: "custom", name: "Farmer custom crop" },
  ]);
  assert.equal(rows.length, fertilizerCrops.length + 1);
  assert.deepEqual(rows.find((c) => c.key === "chickpea")!.cropIds, [
    "real-crop-id",
  ]);
  assert.ok(rows.some((c) => c.cropIds.includes("custom")));
});
test("all supported crops can use isolated explicit synthetic targets without modifying scientific data", () => {
  const before = JSON.stringify(scientificDoses);
  for (const [i, c] of fertilizerCrops.entries()) {
    const d = calculateFertilizerDemo(
      c.name,
      { n: 100 + i, p2o5: 20 + i, k2o: 10 + i },
      1,
    );
    assert.equal(d.mode, "DEMO");
    assert.equal(d.persistable, false);
    assert.equal(d.calendarAllowed, false);
    assert.equal(d.scientificReference, null);
    near(
      d.calculation.total.dap * 0.18 + d.calculation.total.urea * 0.46,
      100 + i,
    );
  }
  assert.equal(JSON.stringify(scientificDoses), before);
  assert.throws(() =>
    calculateFertilizerDemo(
      "Unknown invented crop",
      { n: 100, p2o5: 20, k2o: 10 },
      1,
    ),
  );
  assert.throws(() =>
    calculateFertilizerDemo("Wheat", { n: 0, p2o5: 100, k2o: 0 }, 1),
  );
});
test("manual SHC/KVK arithmetic can use verified SSP grade without assuming DAP fits a low N target", async () => {
  const { calculateCustomFertilizer } =
    await import("../src/lib/icar-fertilizer");
  const input = {
    nitrogenKgHa: 10,
    phosphorusP2O5KgHa: 35,
    potassiumK2OKgHa: 15,
    areaHa: 1,
    basalNitrogenPercent: 100,
    basalPhosphorusPercent: 100,
    basalPotassiumPercent: 100,
    topdressLabel: "User-entered advisory timing",
  };
  assert.equal(calculateCustomFertilizer(input), null);
  const plan = calculateCustomFertilizer({
    ...input,
    phosphorusProduct: "SSP",
  });
  assert.ok(plan);
  assert.equal(plan.total.dap, 0);
  near(plan.total.ssp! * 0.16, 35);
  near(plan.total.urea * 0.46, 10);
});
test("review-pending or incompatible future dataset entries cannot become executable recipes", async () => {
  const { isExecutableScientificDose } =
    await import("../src/lib/scientific-dose-registry");
  for (const changed of [
    { verificationStatus: "PENDING_REVIEW" },
    { originalBasis: "NPK_AMBIGUOUS" },
    { recommendationUnits: "mg/kg" },
    { sourceId: "not-a-reviewed-source" },
  ]) {
    const record = { ...scientificDoses[0], ...changed };
    assert.equal(isExecutableScientificDose(record), false);
    assert.throws(() => registryRecipe(record), /not source-verified/);
  }
});
