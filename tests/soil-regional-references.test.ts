import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSoil, type SoilHealthInput } from "../src/lib/soil-health";
import { soilHealthSchema } from "../src/lib/soil-health-validation";
import {
  availableSoilStandards,
  canonicalSoilMethod,
  soilStandards,
} from "../src/lib/soil-reference-matching";

const sample: SoilHealthInput = {
  state: "Bihar",
  district: "Saran",
  crop: "Wheat",
  growthStage: "Vegetative",
  soilType: "Alluvial",
  nitrogenKgHa: 200,
  phosphorusKgHa: 12,
  potassiumKgHa: 150,
  organicCarbonPercent: 0.6,
  soilPh: 8,
  phMethod: "WATER_1_2_5",
  nutrientUnit: "kg/ha",
  phosphorusBasis: "P",
  potassiumBasis: "K",
  laboratoryName: "Sample issuing lab",
  referenceStandardId: "BIHAR_CSTL_GOI_2011",
  labReferenceConfirmed: true,
  nitrogenMethod: "ALKALINE_KMNO4_N",
  phosphorusMethod: "OLSEN_P",
  potassiumMethod: "NEUTRAL_1N_NH4OAC_K",
  organicCarbonMethod: "WALKLEY_BLACK_OC",
};

test("Bihar and Odisha use explicit regional publication plus method-specific GOI baseline provenance", () => {
  for (const [state, referenceStandardId] of [
    ["Bihar", "BIHAR_CSTL_GOI_2011"],
    ["Odisha", "ODISHA_GOI_2024"],
  ]) {
    const report = analyzeSoil({ ...sample, state, referenceStandardId });
    assert.deepEqual(
      report.nutrients.map((row) => row.rating),
      ["Low", "Medium", "Medium"],
    );
    assert.equal(report.organicCarbon.rating, "Medium");
    for (const row of [...report.nutrients, report.organicCarbon]) {
      assert.ok(row.sourceUrl?.startsWith("https://"));
      assert.equal(row.reference?.region, state);
      assert.ok(row.reference?.method);
      assert.ok(row.reference?.version);
      assert.ok(row.reference?.thresholds.length);
      assert.match(row.reference!.scope, /Indicative national/);
      assert.ok(row.reference?.regionalUrl);
      assert.match(row.guidance, /verified reference/);
    }
    assert.equal(report.score.value, null);
  }
});

test("unrecognized, conflicting and merely nonempty method names remain Unknown", () => {
  for (const [key, value, row] of [
    ["nitrogenMethod", "Total Kjeldahl nitrogen", 0],
    ["nitrogenMethod", "Nitrate-N", 0],
    ["phosphorusMethod", "Bray I", 1],
    ["phosphorusMethod", "Mehlich-3", 1],
    ["phosphorusMethod", "Not Olsen", 1],
    ["potassiumMethod", "Ammonium acetate", 2],
  ] as const) {
    const report = analyzeSoil({ ...sample, [key]: value });
    assert.equal(report.nutrients[row].rating, "Unknown");
    assert.match(report.nutrients[row].guidance, /method/);
    assert.equal(report.nutrients[row].sourceUrl, undefined);
  }
  assert.equal(
    analyzeSoil({ ...sample, organicCarbonMethod: "Dry combustion" })
      .organicCarbon.rating,
    "Unknown",
  );
  assert.equal(
    analyzeSoil({ ...sample, organicCarbonMethod: "Modified Walkley Black" })
      .organicCarbon.rating,
    "Unknown",
  );
  assert.equal(canonicalSoilMethod("Olsen’s method"), "OLSEN_P");
  assert.equal(
    canonicalSoilMethod("Neutral 1N ammonium acetate"),
    "NEUTRAL_1N_NH4OAC_K",
  );
});

test("unknown nutrient basis and measurement unit are never inferred", () => {
  for (const basis of [undefined, "UNKNOWN"] as const)
    assert.equal(
      analyzeSoil({ ...sample, phosphorusBasis: basis }).nutrients[1].rating,
      "Unknown",
    );
  for (const basis of [undefined, "UNKNOWN"] as const)
    assert.equal(
      analyzeSoil({ ...sample, potassiumBasis: basis }).nutrients[2].rating,
      "Unknown",
    );
  assert.ok(
    analyzeSoil({ ...sample, nutrientUnit: undefined }).nutrients.every(
      (row) => row.rating === "Unknown",
    ),
  );
  const payload = { ...sample };
  delete payload.nutrientUnit;
  assert.equal(soilHealthSchema.parse(payload).nutrientUnit, "UNKNOWN");
});

test("unsupported regions and wrong-region IDs never fall back to another state or national defaults", () => {
  for (const state of [
    "Rajasthan",
    "Tamil Nadu",
    "Punjab",
    "Kerala",
    "Unsupported",
  ])
    assert.ok(
      analyzeSoil({ ...sample, state }).nutrients.every(
        (row) => row.rating === "Unknown",
      ),
    );
  assert.ok(
    analyzeSoil({
      ...sample,
      referenceStandardId: "ODISHA_GOI_2024",
    }).nutrients.every((row) => row.rating === "Unknown"),
  );
  assert.equal(availableSoilStandards("Orissa")[0].states[0], "Odisha");
});

test("laboratory identity is optional once the method, basis, unit and regional thresholds match", () => {
  for (const laboratoryName of [undefined, "", "   "]) {
    const report = analyzeSoil({ ...sample, laboratoryName });
    assert.deepEqual(
      report.nutrients.map((row) => row.rating),
      ["Low", "Medium", "Medium"],
    );
    assert.equal(report.organicCarbon.rating, "Medium");
    assert.equal(report.ph.rating, "Slightly alkaline");
    assert.equal(report.ph.laboratoryVerified, false);
    assert.equal(report.nutrients[0].reference?.id, "BIHAR_CSTL_GOI_2011");
    assert.equal(report.soilTestMetadata.labIdentity, "missing");
  }
  assert.deepEqual(
    analyzeSoil({ ...sample, labReferenceConfirmed: undefined }).nutrients.map(
      (row) => row.rating,
    ),
    ["Low", "Medium", "Medium"],
  );
  assert.equal(
    analyzeSoil({ ...sample, nitrogenMethod: "" }).nutrients[0].rating,
    "Unknown",
  );
  assert.equal(
    analyzeSoil({ ...sample, organicCarbonMethod: "" }).organicCarbon.rating,
    "Unknown",
  );
});

test("Olsen alkaline-soil restriction and pH method are enforced independently", () => {
  for (const extra of [
    { soilPh: undefined },
    { soilPh: 6.5 },
    { soilPh: 7 },
    { phMethod: "OTHER" as const },
    { phMethod: "UNKNOWN" as const },
  ])
    assert.equal(
      analyzeSoil({ ...sample, ...extra }).nutrients[1].rating,
      "Unknown",
    );
  const wrongPh = analyzeSoil({ ...sample, phMethod: "OTHER" });
  assert.equal(wrongPh.ph.rating, "Unknown");
  assert.equal(wrongPh.ph.sourceUrl, undefined);
  const validPh = analyzeSoil(sample).ph;
  assert.equal(validPh.rating, "Slightly alkaline");
  assert.ok(validPh.sourceUrl);
  assert.equal(validPh.reference?.method, "WATER_1_2_5");
});

test("unmapped PAU/Kerala sources cannot be unlocked by a confirmation checkbox", () => {
  for (const [state, referenceStandardId] of [
    ["Punjab", "PAU_PUNJAB_2025"],
    ["Kerala", "KERALA_SHIS_REVIEW_2026"],
  ]) {
    const report = analyzeSoil({ ...sample, state, referenceStandardId });
    assert.ok(report.nutrients.every((row) => row.rating === "Unknown"));
    assert.equal(report.organicCarbon.rating, "Unknown");
    assert.match(report.nutrients[0].guidance, /mapping has not been verified/);
    assert.equal(report.reference?.id, referenceStandardId);
  }
});

test("active rules carry reviewed versions, exact methods, bases, units and unambiguous three-class bands", () => {
  for (const standard of soilStandards.filter(
    (item) => item.classificationEnabled,
  )) {
    assert.ok(
      standard.source &&
        standard.version &&
        standard.scope &&
        standard.regionalUrl,
    );
    for (const rule of standard.rules) {
      assert.ok(rule.methods.length && rule.basis && rule.unit);
      assert.deepEqual(
        rule.bands.map((band) => band.label),
        ["Low", "Medium", "High"],
      );
      assert.equal(rule.bands[0].max, rule.bands[1].min);
      assert.notEqual(rule.bands[0].maxInclusive, rule.bands[1].minInclusive);
      assert.equal(rule.bands[1].max, rule.bands[2].min);
      assert.notEqual(rule.bands[1].maxInclusive, rule.bands[2].minInclusive);
    }
  }
});
