import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appliedNutrients,
  calculateNutrients,
  productsFor,
  grades,
  fieldHectares,
  soilModelReadiness,
  estimateCost,
  canSchedule,
} from "../src/lib/smart-fertilizer";
import { soilHealthSchema } from "../src/lib/soil-health-validation";
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test("missing labs, unknown units and incompatible bases never enable soil-adjusted doses", () => {
  for (const input of [
    undefined,
    {},
    { nitrogenKgHa: 0, nutrientUnit: "UNKNOWN" as const },
    {
      nutrientUnit: "mg/kg" as const,
      phosphorusBasis: "P" as const,
      potassiumBasis: "K" as const,
    },
    { mode: "DEMO" as const },
  ]) {
    const result = soilModelReadiness(input);
    assert.equal(result.enabled, false);
    assert.ok(result.missing.length);
  }
  assert.ok(
    soilModelReadiness({
      nitrogenKgHa: 0,
      phosphorusKgHa: 0,
      potassiumKgHa: 0,
    }).missing.every((m) => !m.startsWith("Missing nitrogenKgHa")),
  );
  assert.match(soilModelReadiness({}).missing.join(" "), /coefficients/);
});
test("invalid areas and unknown area units fail instead of assuming acres", () => {
  for (const a of [0, -1, NaN, Infinity])
    assert.throws(() => fieldHectares(a, "ha"));
  assert.throws(() => fieldHectares(1, "bigha"));
  near(fieldHectares(2, "acre"), 0.80937128448);
});
test("DAP nitrogen and MOP accounting conserve nutrient targets across field scaling", () => {
  const result = calculateNutrients({ n: 120, p2o5: 60, k2o: 40 }, 2, []);
  near(result.products.DAP * 0.46, 120);
  near(result.products.DAP * 0.18 + result.products.Urea * 0.46, 240);
  near(result.products.MOP * 0.6, 80);
  assert.throws(() => productsFor({ n: 1, p2o5: 60, k2o: 0 }), /DAP/);
  assert.throws(
    () =>
      calculateNutrients({ n: 121, p2o5: 60, k2o: 40 }, 1, [], {
        n: 120,
        p2o5: 60,
        k2o: 40,
      }),
    /limit/,
  );
});
test("only applied entries count once and excess applied nutrients never produce negative products", () => {
  const apps = [
    { quantityKg: 50, composition: grades.DAP, status: "APPLIED" },
    { quantityKg: 500, composition: grades.Urea, status: "CANCELLED" },
    { quantityKg: 500, composition: grades.Urea, status: "PLANNED" },
  ];
  assert.deepEqual(appliedNutrients(apps), { n: 9, p2o5: 23, k2o: 0 });
  const r = calculateNutrients({ n: 120, p2o5: 60, k2o: 40 }, 1, apps);
  near(r.remaining.n, 111);
  near(r.remaining.p2o5, 37);
  near(r.products.Urea * 0.46 + r.products.DAP * 0.18, 111);
  const excess = calculateNutrients({ n: 1, p2o5: 0, k2o: 0 }, 1, [
    { quantityKg: 100, composition: grades.Urea, status: "APPLIED" },
  ]);
  assert.equal(excess.products.Urea, 0);
  assert.ok(excess.warnings.length);
});
test("completed and harvested cycles cannot generate schedules", () => {
  for (const status of ["COMPLETED", "HARVESTED"])
    assert.equal(
      canSchedule({ status, sowingDate: new Date(), actualHarvestDate: null }),
      false,
    );
  assert.equal(
    canSchedule({
      status: "ACTIVE",
      sowingDate: new Date(),
      actualHarvestDate: new Date(),
    }),
    false,
  );
  assert.equal(
    canSchedule({
      status: "ACTIVE",
      sowingDate: null,
      actualHarvestDate: null,
    }),
    false,
  );
});
test("regional reference rejects wrong season, district and previously misattributed Bihar coverage", () => {});
test("local bag prices scale by kg and hectares without invented prices", () => {
  const r = estimateCost(125, 1000, 50, 2);
  assert.equal(r.total, 2500);
  assert.equal(r.perHa, 1250);
  assert.equal(r.unitPrice, 20);
  assert.throws(() => estimateCost(1, 1000, 0, 1));
  assert.throws(() => estimateCost(1, -1, 50, 1));
});
test("migration adds tables and foreign keys without changing existing columns or rows", () => {
  const sql = readFileSync(
    new URL(
      "../prisma/migrations/202611140004_smart_fertilizer/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    sql,
    /\b(DROP|TRUNCATE|DELETE|UPDATE|MODIFY|RENAME)\s+(TABLE|FROM|`|COLUMN)/i,
  );
  assert.equal((sql.match(/CREATE TABLE/g) || []).length, 6);
  assert.match(sql, /FertilizerApplication_requestKey_key/);
  assert.match(sql, /FertilizerApplication_expenseId_key/);
});

test("optional laboratory issue dates remain distinct from sampling dates", () => {
  const input = {
    state: "Maharashtra",
    district: "Pune",
    crop: "Maize",
    growthStage: "Vegetative",
    soilType: "Black",
    nitrogenKgHa: 0,
    sampleDate: "2026-01-01",
    reportDate: "2026-01-10",
  };
  const parsed = soilHealthSchema.parse(input);
  assert.equal(parsed.sampleDate, "2026-01-01");
  assert.equal(parsed.reportDate, "2026-01-10");
  assert.equal(
    soilHealthSchema.safeParse({ ...input, reportDate: "2025-12-31" }).success,
    false,
  );
  assert.equal(
    soilHealthSchema.safeParse({ ...input, reportDate: "2026-02-30" }).success,
    false,
  );
});

test("supplemental soil measurements retain their laboratory metadata without enabling a dose", () => {
  const base = {
    state: "Tamil Nadu",
    district: "Coimbatore",
    crop: "Sunflower",
    growthStage: "Vegetative",
    soilType: "Black",
  };
  const reading = {
    analyte: "EC",
    value: 0.4,
    unit: "dS/m",
    method: "Saturated paste extract",
    basis: "Measured at 25 °C",
  };
  const parsed = soilHealthSchema.parse({
    ...base,
    supplementalReadings: [reading],
  });
  assert.deepEqual(parsed.supplementalReadings, [reading]);
  assert.equal(soilModelReadiness(parsed).enabled, false);
  assert.equal(
    soilHealthSchema.safeParse({
      ...base,
      supplementalReadings: [reading, reading],
    }).success,
    false,
  );
  assert.equal(
    soilHealthSchema.safeParse({
      ...base,
      supplementalReadings: [{ ...reading, unit: "" }],
    }).success,
    false,
  );
});
