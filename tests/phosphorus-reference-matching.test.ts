import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSoil } from "../src/lib/soil-health";
import type { SoilHealthInput } from "../src/lib/soil-health";
import { convertNutrientBasis } from "../src/lib/nutrient-basis";
import { soilHealthSchema } from "../src/lib/soil-health-validation";
import { draftFromSoilText } from "../src/lib/soil-local-scan";
import { soilScreeningBand, soilScreeningResultReason } from "../src/i18n/soil-screening-copy";
const sample: SoilHealthInput = {
  mode: "REAL",
  state: "Bihar",
  district: "Chhapra",
  crop: "Barley",
  growthStage: "Vegetative",
  soilType: "Alluvial",
  soilPh: 6.5,
  phMethod: "WATER_1_2_5",
  phosphorusKgHa: 35,
  phosphorusBasis: "P2O5",
  phosphorusMethod: "OLSEN_P",
  nutrientUnit: "kg/ha",
  laboratoryName: "ISOLATED TEST LAB",
  labReferenceConfirmed: true,
  referenceStandardId: "BIHAR_CSTL_GOI_2011",
};
test("pH 6.5 Olsen result retains a chemical conversion audit without a threshold interpretation", () => {
  const before = structuredClone(sample),
    report = analyzeSoil(sample),
    p = report.nutrients[1];
  assert.equal(
    report.validationDiagnostics[1].detail,
    p.applicabilityExplanation,
  );
  assert.equal(p.rating, "Unknown");
  assert.equal(p.explanationCode, "OLSEN_SOIL_CONDITION");
  assert.equal(p.interpretation, undefined);
  assert.equal(p.reference, undefined);
  assert.equal(p.value, 35);
  assert.equal(p.basis, "P2O5");
  assert.equal(p.unit, "kg/ha");
  assert.equal(p.reportingBasisConversion!.value, 15.295);
  assert.equal(
    p.reportingBasisConversion!.reference!.id,
    "GOI-2011-ANNEXURE-12",
  );
  assert.equal(p.rejectedReference!.id, "BIHAR_CSTL_GOI_2011");
  assert.equal(p.rejectedReference!.recordedPh, 6.5);
  assert.match(
    p.applicabilityExplanation!,
    /restriction of the selected interpretation table/,
  );
  assert.match(
    p.applicabilityExplanation!,
    /confirmation alone cannot override/,
  );
  assert.deepEqual(sample, before);
});
test("phosphorus classification still needs compatible soil condition and pH method; lab attestation is optional", () => {
  for (const soilPh of [6.5, 6.6, 7])
    assert.equal(
      analyzeSoil({ ...sample, soilPh }).nutrients[1].explanationCode,
      "OLSEN_SOIL_CONDITION",
    );
  const valid = analyzeSoil({ ...sample, soilPh: 8.2 }).nutrients[1];
  assert.equal(valid.rating, "Medium");
  assert.equal(valid.interpretation!.value, 15.295);
  assert.equal(valid.rejectedReference, undefined);
  assert.equal(
    analyzeSoil({ ...sample, soilPh: 8.2, phMethod: "OTHER" }).nutrients[1]
      .rating,
    "Unknown",
  );
  const unconfirmed = analyzeSoil({
    ...sample,
    soilPh: 8.2,
    labReferenceConfirmed: false,
  }).nutrients[1];
  assert.equal(unconfirmed.rating, "Medium");
});
test("reporting-basis equivalence cannot establish extractant or concentration equivalence", () => {
  const elemental = convertNutrientBasis(35, "P2O5", "P").value;
  assert.equal(
    analyzeSoil({ ...sample, phosphorusBasis: "P", phosphorusKgHa: elemental })
      .nutrients[1].rating,
    "Unknown",
  );
  const bray = analyzeSoil({ ...sample, phosphorusMethod: "Bray I" })
    .nutrients[1];
  assert.equal(bray.explanationCode, "UNSUPPORTED_METHOD");
  assert.equal(bray.reportingBasisConversion, undefined);
  const concentration = analyzeSoil({ ...sample, nutrientUnit: "mg/kg" })
    .nutrients[1];
  assert.equal(concentration.explanationCode, "INCOMPATIBLE_UNIT");
  assert.equal(concentration.reportingBasisConversion, undefined);
  const missing = analyzeSoil({ ...sample, phosphorusKgHa: undefined })
    .nutrients[1];
  assert.equal(missing.explanationCode, "MISSING_READING");
  assert.equal(missing.reportingBasisConversion, undefined);
});

test("Saran Olsen P classifies on both sides and at the published limits", () => {
  for (const [value, rating] of [[9.99, "Low"], [10, "Medium"], [24.6, "Medium"], [30, "High"]] as const) {
    const input = soilHealthSchema.parse({
      ...sample,
      district: "Saran",
      soilPh: 8,
      phMethod: "Soil: distilled water (1:2.5)",
      phosphorusMethod: "Olsen et al. (1954)",
      phosphorusValue: value,
      phosphorusUnit: "kg/ha",
      phosphorusBasis: "P",
    });
    const row = analyzeSoil(input).nutrients[1];
    assert.equal(row.rating, rating);
    assert.equal(row.reference?.basis, "P");
    assert.match(row.reference!.url, /manualgoi\.pdf#page=34$/);
    assert.match(row.reference!.scope, /^Indicative national/);
    if (rating === "High") assert.equal(soilScreeningBand("en", row), ">24.6 kg/ha P");
  }
});

test("explicit scanned oxide basis and acre unit use the same Olsen bands after conversion", () => {
  const draft = draftFromSoilText(
    "Phosphorus: 30 kg/ha as P₂O₅\nPhosphorus method: Olsen et al. (1954)\nSoil pH: 8\nSoil pH method: Soil: distilled water (1:2.5)",
  );
  assert.equal(draft?.phosphorusBasis, "P2O5");
  const row = analyzeSoil(soilHealthSchema.parse({ ...sample, ...draft })).nutrients[1];
  assert.equal(row.rating, "Medium");
  assert.equal(row.interpretation?.value, 13.11);
  const acre = analyzeSoil({
    ...sample, soilPh: 8, phosphorusValue: 30 * 0.40468564224,
    phosphorusUnit: "kg/acre",
  }).nutrients[1];
  assert.equal(acre.rating, "Medium");
  assert.ok(Math.abs(acre.interpretation!.value - 13.11) < 1e-10);
  assert.equal(draftFromSoilText("Phosphorus (P): 30 kg/ha as P₂O₅"), null);
});

test("Unknown identifies the missing or incompatible evidence and invalid numbers", () => {
  const input = { ...sample, soilPh: 8, phosphorusValue: 30 };
  for (const [overrides, code] of [
    [{ phosphorusBasis: "UNKNOWN" }, "UNKNOWN_NUTRIENT_BASIS"],
    [{ phosphorusUnit: "UNKNOWN" }, "UNKNOWN_UNIT"],
    [{ phosphorusMethod: "" }, "UNSUPPORTED_METHOD"],
    [{ phosphorusMethod: "BRAY_1_P" }, "REFERENCE_METHOD_MISMATCH"],
    [{ phosphorusValue: -1 }, "INVALID_READING"],
    [{ phosphorusValue: NaN }, "INVALID_READING"],
    [{ phosphorusValue: Infinity }, "INVALID_READING"],
  ] as const) {
    const row = analyzeSoil({ ...input, ...overrides }).nutrients[1];
    assert.equal(row.rating, "Unknown");
    assert.equal(row.explanationCode, code);
    assert.equal(soilScreeningBand("en", row), null);
  }
  assert.equal(soilHealthSchema.safeParse({ ...input, phosphorusKgHa: -1 }).success, false);
  const missingPh = analyzeSoil({ ...input, soilPh: undefined }).nutrients[1];
  assert.match(soilScreeningResultReason("en", missingPh), /Enter the soil pH/);
  assert.match(soilScreeningResultReason("hi", missingPh), /लैब रिपोर्ट/);
  assert.match(soilScreeningResultReason("bn", missingPh), /ল্যাব রিপোর্ট/);
  const wrongPhMethod = analyzeSoil({ ...input, phMethod: "OTHER" }).nutrients[1];
  assert.match(soilScreeningResultReason("en", wrongPhMethod), /Check the pH test method/);
});
