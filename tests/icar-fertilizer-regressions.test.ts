import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCustomFertilizer,
  customFertilizerError,
} from "../src/lib/icar-fertilizer";
const input = {
  nitrogenKgHa: 100,
  phosphorusP2O5KgHa: 100,
  potassiumK2OKgHa: 40,
  areaHa: 1,
  basalNitrogenPercent: 50,
  basalPhosphorusPercent: 100,
  basalPotassiumPercent: 100,
  topdressLabel: "30 DAS",
};
test("incompatible basal and topdress DAP nitrogen targets reject the entire schedule", () => {
  assert.equal(
    calculateCustomFertilizer({ ...input, basalNitrogenPercent: 20 }),
    null,
  );
  assert.match(
    customFertilizerError({ ...input, basalNitrogenPercent: 20 })!,
    /Basal DAP/,
  );
  assert.match(
    customFertilizerError({
      ...input,
      basalNitrogenPercent: 90,
      basalPhosphorusPercent: 0,
    })!,
    /Topdressing DAP/,
  );
  assert.equal(calculateCustomFertilizer({ ...input, nitrogenKgHa: 10 }), null);
});
test("invalid areas, rates and splits fail at the calculation boundary", () => {
  for (const value of [0, -1, NaN, Infinity])
    assert.equal(calculateCustomFertilizer({ ...input, areaHa: value }), null);
  for (const key of [
    "nitrogenKgHa",
    "phosphorusP2O5KgHa",
    "potassiumK2OKgHa",
  ] as const)
    for (const value of [-1, NaN, Infinity, 100001])
      assert.equal(calculateCustomFertilizer({ ...input, [key]: value }), null);
  for (const key of [
    "basalNitrogenPercent",
    "basalPhosphorusPercent",
    "basalPotassiumPercent",
  ] as const)
    for (const value of [-1, 101, NaN, Infinity])
      assert.equal(calculateCustomFertilizer({ ...input, [key]: value }), null);
});
test("accepted custom schedules conserve products and delivered nutrients (1e-8 relative tolerance)", () => {
  for (const areaHa of [0.01, 1, 2.5, 1000])
    for (const percent of [0, 20, 50, 100]) {
      const plan = calculateCustomFertilizer({
        ...input,
        areaHa,
        basalNitrogenPercent: percent,
        basalPhosphorusPercent: percent,
        basalPotassiumPercent: percent,
      });
      assert.ok(plan);
      const near = (a: number, b: number) =>
        assert.ok(
          Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(b)),
          `${a} != ${b}`,
        );
      for (const key of ["urea", "dap", "mop"] as const) {
        near(
          plan.schedule.reduce((sum, row) => sum + row[key], 0),
          plan.total[key],
        );
        assert.ok(plan.schedule.every((row) => row[key] >= 0));
      }
      near(
        plan.total.urea * 0.46 + plan.total.dap * 0.18,
        input.nitrogenKgHa * areaHa,
      );
      near(plan.total.dap * 0.46, input.phosphorusP2O5KgHa * areaHa);
      near(plan.total.mop * 0.6, input.potassiumK2OKgHa * areaHa);
    }
});
