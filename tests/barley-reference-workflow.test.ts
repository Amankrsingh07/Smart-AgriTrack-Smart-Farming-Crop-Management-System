import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSoil, type SoilHealthInput } from "../src/lib/soil-health";
import { calculateCustomFertilizer } from "../src/lib/icar-fertilizer";
const sample: SoilHealthInput = {
  mode: "REAL",
  state: "Bihar",
  district: "Chhapra",
  crop: "Barley",
  growthStage: "Vegetative",
  soilType: "Alluvial",
  fieldAreaHa: 2.5 * 0.40468564224,
  nitrogenKgHa: 235,
  phosphorusKgHa: 35,
  potassiumKgHa: 179.84,
  organicCarbonPercent: 0.3,
  soilPh: 6.5,
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
  laboratoryName: "ISOLATED TEST LAB",
};
test("laboratory confirmation and identity remain audit metadata when analytical inputs match", () => {
  const r = analyzeSoil({ ...sample, labReferenceConfirmed: false });
  assert.deepEqual(
    r.nutrients.map((n) => n.rating),
    ["Low", "Unknown", "Medium"],
  );
  assert.equal(r.ph.rating, "Slightly acidic");
  const noLab = analyzeSoil({ ...sample, laboratoryName: "" });
  assert.deepEqual(
    noLab.nutrients.map((n) => n.rating),
    ["Low", "Unknown", "Medium"],
  );
  assert.equal(noLab.soilTestMetadata.labIdentity, "missing");
  const noReference = analyzeSoil({
    ...sample,
    referenceStandardId: "UNKNOWN",
    labReferenceConfirmed: false,
  });
  assert.ok(
    noReference.validationDiagnostics
      .slice(0, 4)
      .every((d) => d.code === "REFERENCE_REGION_MISMATCH"),
  );
});
test("an incompatible assay is a reference gap and never blocks independently valid indicators", () => {
  const r = analyzeSoil({
    ...sample,
    nitrogenMethod: "Total Kjeldahl nitrogen",
  });
  assert.equal(r.nutrients[0].rating, "Unknown");
  assert.equal(r.nutrients[2].rating, "Medium");
  assert.equal(r.organicCarbon.rating, "Low");
  assert.equal(r.ph.rating, "Slightly acidic");
  assert.equal(r.validationDiagnostics[0].category, "REFERENCE_DATASET");
  assert.match(
    r.validationDiagnostics[0].action,
    /Keep the recorded method Total Kjeldahl/,
  );
  const missing = analyzeSoil({ ...sample, nitrogenMethod: "" });
  assert.equal(missing.validationDiagnostics[0].category, "FARMER_INPUT");
});
test("existing calculator remains available for explicit advisory rates and retains DAP nitrogen accounting", () => {
  // Test arithmetic on farmer-entered rates; this is NOT a verified Barley prescription.
  const area = 2.5 * 0.40468564224;
  const plan = calculateCustomFertilizer({
    nitrogenKgHa: 60,
    phosphorusP2O5KgHa: 30,
    potassiumK2OKgHa: 0,
    areaHa: area,
    basalNitrogenPercent: 50,
    basalPhosphorusPercent: 100,
    basalPotassiumPercent: 100,
    topdressLabel: "Farmer-entered advisory timing",
  })!;
  assert.ok(plan);
  assert.ok(
    Math.abs(plan.total.dap * 0.18 + plan.total.urea * 0.46 - 60 * area) < 1e-8,
  );
  assert.ok(Math.abs(plan.total.dap * 0.46 - 30 * area) < 1e-8);
  for (const key of ["urea", "dap", "mop"] as const)
    assert.ok(
      Math.abs(
        plan.schedule.reduce((sum, s) => sum + s[key], 0) - plan.total[key],
      ) < 1e-8,
    );
});

test("reviewed nonalkaline Olsen and Bihar-inclusive advisory evidence never become executable thresholds or doses", () => {
  const r = analyzeSoil(sample),
    review = r.fertilizerAssessment.scientificReview!;
  assert.equal(review.version, "2026-11-14.2");
  assert.equal(review.calculationEnabled, false);
  assert.equal(review.numericalRecommendation, null);
  assert.deepEqual(review.actionableSchedule, []);
  for (const code of [
    "NO_COMPATIBLE_NONALKALINE_OLSEN_REFERENCE",
    "BARLEY_STANDARD_ADVISORY_REQUIRES_BASIS_AND_CONTEXT",
    "BARLEY_STCR_REFERENCE_REGION_MISMATCH",
  ]) {
    const issue = r.fertilizerAssessment.missingRequirements.find(
      (i) => i.code === code,
    );
    assert.ok(issue, code);
    assert.match(issue.detail, /https:\/\//);
    assert.match(issue.detail, /2026-11-14.2/);
  }
  assert.equal(r.nutrients[1].explanationCode, "OLSEN_SOIL_CONDITION");
  for (const ph of [6.5, 6.6, 7])
    assert.equal(
      analyzeSoil({ ...sample, soilPh: ph }).nutrients[1].rating,
      "Unknown",
    );
  const alkaline = analyzeSoil({ ...sample, soilPh: 8 });
  assert.equal(alkaline.nutrients[1].rating, "Medium");
  assert.ok(
    !alkaline.fertilizerAssessment.missingRequirements.some(
      (i) => i.code === "NO_COMPATIBLE_NONALKALINE_OLSEN_REFERENCE",
    ),
  );
  assert.equal(alkaline.fertilizerAssessment.numericalRecommendation, null);
});
test("explicit advisory arithmetic scales 2.5 acres, deducts DAP nitrogen and conserves each scheduled nutrient", () => {
  // Numerical fixture checks the existing engine, not a validated Barley advisory.
  const area = 2.5 * 0.40468564224;
  const r = calculateCustomFertilizer({
    nitrogenKgHa: 100,
    phosphorusP2O5KgHa: 40,
    potassiumK2OKgHa: 30,
    areaHa: area,
    basalNitrogenPercent: 50,
    basalPhosphorusPercent: 100,
    basalPotassiumPercent: 100,
    topdressLabel: "Explicit advisory timing fixture",
  })!;
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8);
  near(r.total.dap, (40 / 0.46) * area);
  near(r.total.mop, (30 / 0.6) * area);
  near(r.total.urea, ((100 - (40 / 0.46) * 0.18) / 0.46) * area);
  for (const row of r.schedule)
    assert.ok(row.urea >= 0 && row.dap >= 0 && row.mop >= 0);
  near(r.schedule[0].urea * 0.46 + r.schedule[0].dap * 0.18, 50 * area);
  near(r.schedule[1].urea * 0.46 + r.schedule[1].dap * 0.18, 50 * area);
  for (const name of ["urea", "dap", "mop"] as const)
    near(
      r.schedule.reduce((sum, row) => sum + row[name], 0),
      r.total[name],
    );
});
