import test from "node:test";
import assert from "node:assert/strict";
import { convertNutrientBasis } from "../src/lib/nutrient-basis";
import { analyzeSoil, type SoilHealthInput } from "../src/lib/soil-health";
import { soilReadiness } from "../src/lib/soil-health-readiness";
export const biharSample: SoilHealthInput = {
  mode: "REAL",
  state: "Bihar",
  district: "Chhapra",
  crop: "Wheat",
  growthStage: "Vegetative",
  soilType: "Alluvial",
  fieldAreaHa: 2.5 * 0.40468564224,
  nitrogenKgHa: 180,
  phosphorusKgHa: 35,
  potassiumKgHa: 110,
  organicCarbonPercent: 0.2,
  soilPh: 8.2,
  nutrientUnit: "kg/ha",
  phosphorusBasis: "P2O5",
  potassiumBasis: "K2O",
  nitrogenMethod: "ALKALINE_KMNO4_N",
  phosphorusMethod: "OLSEN_P",
  potassiumMethod: "NEUTRAL_1N_NH4OAC_K",
  organicCarbonMethod: "WALKLEY_BLACK_OC",
  phMethod: "WATER_1_2_5",
  referenceStandardId: "BIHAR_CSTL_GOI_2011",
  labReferenceConfirmed: true,
  laboratoryName: "ISOLATED TEST issuing lab",
  reportNumber: "TEST-ONLY",
  sampleDate: "2026-11-01",
  samplingDepthCm: 15,
};
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("GOI Annexure 12 chemical factors support both directions, with original readings and source audit", () => {
  for (const [from, to, factor] of [
    ["P", "P2O5", 2.29],
    ["P2O5", "P", 0.437],
    ["K", "K2O", 1.2],
    ["K2O", "K", 0.83],
  ] as const) {
    const r = convertNutrientBasis(35, from, to);
    near(r.value, 35 * factor);
    assert.equal(r.originalValue, 35);
    assert.equal(r.factor, factor);
    assert.equal(r.reference?.id, "GOI-2011-ANNEXURE-12");
    assert.ok(r.minimum < r.value && r.maximum > r.value);
  }
  for (const v of [-1, NaN, Infinity])
    assert.throws(() => convertNutrientBasis(v, "P2O5", "P"));
  for (const pair of [
    ["P", "K"],
    ["UNKNOWN", "P"],
    ["P2O5", "K2O"],
  ])
    assert.throws(() => convertNutrientBasis(35, pair[0], pair[1]));
  assert.equal(convertNutrientBasis(0, "P2O5", "P").value, 0);
});
test("the reported Wheat sample becomes N Low, P Medium, K Low while raw oxide values remain unchanged", () => {
  const before = structuredClone(biharSample);
  const report = analyzeSoil(biharSample);
  assert.deepEqual(
    report.nutrients.map((r) => r.rating),
    ["Low", "Medium", "Low"],
  );
  assert.equal(report.organicCarbon.rating, "Low");
  assert.equal(report.ph.rating, "Slightly alkaline");
  assert.equal(report.nutrients[1].value, 35);
  assert.equal(report.nutrients[1].basis, "P2O5");
  near(report.nutrients[1].interpretation!.value, 15.295);
  assert.equal(report.nutrients[2].value, 110);
  near(report.nutrients[2].interpretation!.value, 91.3);
  assert.equal(report.nutrients[2].interpretation!.basis, "K");
  assert.match(report.nutrients[1].reference!.scope, /Indicative national/);
  assert.deepEqual(biharSample, before);
  assert.ok(
    !soilReadiness(biharSample).some((i) => i.key.endsWith("BasisMismatch")),
  );
});
test("method, unit, geographic and lab-attestation guards run before chemical conversion", () => {
  for (const extra of [
    { phosphorusMethod: "Bray I" },
    { nutrientUnit: "mg/kg" as const },
    { referenceStandardId: "PAU_PUNJAB_2025" },
    { phMethod: "OTHER" as const },
    { soilPh: 6.8 },
  ])
    assert.equal(
      analyzeSoil({ ...biharSample, ...extra }).nutrients[1].rating,
      "Unknown",
      JSON.stringify(extra),
    );
  assert.equal(
    analyzeSoil({ ...biharSample, labReferenceConfirmed: false }).nutrients[1]
      .rating,
    "Medium",
    "lab attestation is audit information, not a classification gate",
  );
  assert.equal(
    analyzeSoil({ ...biharSample, potassiumMethod: "Ammonium acetate" })
      .nutrients[2].explanationCode,
    "UNSUPPORTED_METHOD",
  );
  assert.equal(
    analyzeSoil({ ...biharSample, nutrientUnit: "mg/kg" }).nutrients[1]
      .explanationCode,
    "INCOMPATIBLE_UNIT",
  );
  const acres = analyzeSoil({
    ...biharSample,
    nutrientUnit: "kg/acre",
    phosphorusKgHa: 35 * 0.40468564224,
    potassiumKgHa: 110 * 0.40468564224,
  });
  near(acres.nutrients[1].interpretation!.value, 15.295);
  near(acres.nutrients[2].interpretation!.value, 91.3);
});
test("rounded source factors cannot invent a class at a threshold boundary", () => {
  const report = analyzeSoil({ ...biharSample, phosphorusKgHa: 10 / 0.437 });
  assert.equal(report.nutrients[1].rating, "Unknown");
  assert.equal(
    report.nutrients[1].explanationCode,
    "CONVERSION_BOUNDARY_UNCERTAINTY",
  );
  assert.ok(report.nutrients[1].interpretation);
});
test("compatible classes do not fabricate a Bihar Wheat adjustment model or product dose", () => {
  const a = analyzeSoil(biharSample).fertilizerAssessment;
  assert.equal(a.reference, null);
  assert.equal(a.standardCalculatorRecipeId, null);
  assert.equal(a.status, "UNVERIFIED");
  assert.equal(a.numericalRecommendation, null);
  assert.ok(
    a.missingRequirements.some(
      (i) => i.code === "NO_VALIDATED_REGIONAL_ADJUSTMENT_RULE",
    ),
  );
  assert.ok(
    a.suggestions.every(
      (p) =>
        p.totalQuantityKg === null &&
        p.quantityPerAcreKg === null &&
        p.applicationSchedule.length === 0,
    ),
  );
  const missing = analyzeSoil({
    ...biharSample,
    state: "Rajasthan",
  }).fertilizerAssessment;
  assert.equal(missing.reference, null);
  assert.ok(
    missing.missingRequirements.some(
      (i) => i.code === "NO_VERIFIED_CROP_DOSE_REFERENCE",
    ),
  );
  assert.equal(
    analyzeSoil({ ...biharSample, fieldAreaHa: undefined }).fertilizerAssessment
      .fieldAreaHa,
    null,
  );
});
