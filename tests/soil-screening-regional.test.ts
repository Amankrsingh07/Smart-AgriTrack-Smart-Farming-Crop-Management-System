import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSoil } from "../src/lib/soil-health";
import { soilHealthSchema } from "../src/lib/soil-health-validation";
import { findIndianDistrict } from "../src/lib/india-location";
import { matchScientificDoses } from "../src/lib/scientific-dose-registry";
import { languages } from "../src/i18n/languages";
import {
  soilScreeningCopy,
  soilScreeningCopyKeys,
} from "../src/i18n/soil-screening-copy";

const base = {
  state: "Bihar",
  district: "Chhapra",
  crop: "Wheat",
  season: "RABI" as const,
  growthStage: "Vegetative",
  soilType: "Alluvial",
  nitrogenValue: 280,
  phosphorusValue: 22,
  potassiumValue: 160,
  soilPh: 6.8,
};

test("offline Saran wheat lookup matches Chhapra alias and preserves ICAR nutrient targets", () => {
  assert.equal(findIndianDistrict("10", "Chhapra")?.name, "Saran");
  const doses = matchScientificDoses("Wheat", "Bihar", "Chhapra", "RABI", {
    includeConfirmationOptions: true,
  });
  const saran = doses.find(
    (item) => item.id === "icar-iiss-2026-bihar-saran-wheat",
  );
  assert.deepEqual(saran?.nutrientsKgHa, { n: 120, p2o5: 40, k2o: 45 });
  assert.deepEqual(
    analyzeSoil(base).regionalRecommendations[0]?.nutrientsKgHa,
    { n: 120, p2o5: 40, k2o: 45 },
  );
});

test("missing units remain explicit and do not classify NPK", () => {
  const result = analyzeSoil(base);
  assert.deepEqual(
    result.nutrients.map((item) => item.rating),
    ["Unknown", "Unknown", "Unknown"],
  );
  assert.deepEqual(
    result.nutrients.map((item) => item.unit),
    ["UNKNOWN", "UNKNOWN", "UNKNOWN"],
  );
});

test("valid water 1:2.5 pH is classified without lab identity, while verification remains separate", () => {
  const result = analyzeSoil({ ...base, phMethod: "WATER_1_2_5" });
  assert.equal(result.ph.value, 6.8);
  assert.equal(result.ph.rating, "Neutral");
  assert.equal(result.ph.laboratoryVerified, false);
});

test("nutrient classes require a compatible unit, basis, method, region reference and lab applicability", () => {
  const complete = {
    ...base,
    referenceStandardId: "BIHAR_CSTL_GOI_2011",
    laboratoryName: "Test lab",
    labReferenceConfirmed: true,
    nitrogenUnit: "kg/ha" as const,
    phosphorusUnit: "kg/ha" as const,
    potassiumUnit: "kg/ha" as const,
    phosphorusBasis: "P" as const,
    potassiumBasis: "K" as const,
    nitrogenMethod: "ALKALINE_KMNO4_N",
    phosphorusMethod: "OLSEN_P",
    potassiumMethod: "NEUTRAL_1N_NH4OAC_K",
  };
  const output = analyzeSoil(complete);
  assert.equal(output.nutrients[0].rating, "Medium");
  assert.equal(
    output.nutrients[1].rating,
    "Unknown",
    "Olsen P table requires alkaline pH",
  );
  assert.equal(output.nutrients[2].rating, "Medium");
  const incompatible = analyzeSoil({
    ...complete,
    nitrogenMethod: "OTHER",
    phosphorusUnit: "ppm",
  });
  assert.equal(incompatible.nutrients[0].rating, "Unknown");
  assert.equal(incompatible.nutrients[1].rating, "Unknown");
});

test("input validation rejects out-of-range soil and pH values while accepting missing unit metadata", () => {
  const parsed = soilHealthSchema.safeParse({ ...base, mode: "REAL" });
  assert.equal(parsed.success, true);
  assert.equal(
    soilHealthSchema.safeParse({ ...base, soilPh: 14.1 }).success,
    false,
  );
  assert.equal(
    soilHealthSchema.safeParse({ ...base, nitrogenValue: -1 }).success,
    false,
  );
});

test("soil screening and source labels are translated for each supported farmer language", () => {
  for (const language of languages.filter((item) => item.code !== "en")) {
    for (const key of soilScreeningCopyKeys)
      assert.notEqual(
        soilScreeningCopy(language.code, key),
        key,
        `${language.code}: ${key}`,
      );
  }
});

test("API accepts reported oxide notation and equivalent pH method labels without guessing nutrients", () => {
  const input = soilHealthSchema.parse({
    ...base,
    soilPh: 8,
    referenceStandardId: "BIHAR_CSTL_GOI_2011",
    nutrientUnit: "kg/ha",
    nitrogenUnit: "UNKNOWN",
    phosphorusUnit: "KG / HA",
    potassiumUnit: "kg/ha",
    phosphorusValue: 40,
    phosphorusBasis: "P₂O₅",
    potassiumBasis: "K",
    phosphorusMethod: "Olsen sodium bicarbonate",
    potassiumMethod: "Neutral 1N ammonium acetate",
    nitrogenMethod: "Alkaline KMnO₄",
    phMethod: "Soil:Water 1 : 2.5",
  });
  assert.equal(input.phosphorusValue, 40);
  assert.equal(input.phosphorusBasis, "P2O5");
  assert.equal(input.phosphorusUnit, "kg/ha");
  assert.equal(input.phosphorusMethod, "Olsen sodium bicarbonate");
  assert.equal(input.phMethod, "WATER_1_2_5");
  const {
    nutrients: [nitrogen, phosphorus, potassium],
    ph,
  } = analyzeSoil(input);
  assert.equal(nitrogen.explanationCode, "UNKNOWN_UNIT");
  assert.equal(phosphorus.rating, "Medium");
  assert.equal(phosphorus.value, 40);
  assert.equal(phosphorus.interpretation?.value, 17.48);
  assert.equal(
    analyzeSoil({ ...input, phosphorusBasis: "P" }).nutrients[1].rating,
    "High",
  );
  assert.equal(potassium.rating, "Medium");
  assert.notEqual(ph.rating, "Unknown");
  assert.equal(
    soilHealthSchema.safeParse({ ...input, phMethod: "water 1:25" }).success,
    false,
  );
  for (const method of [
    "Bray P-1",
    "Mehlich-3 ICP",
    "Mehlich-3 colorimetric",
  ]) {
    const row = analyzeSoil({ ...input, phosphorusMethod: method })
      .nutrients[1];
    assert.equal(row.rating, "Unknown", method);
    assert.equal(row.explanationCode, "REFERENCE_METHOD_MISMATCH");
  }
  const ppm = analyzeSoil({ ...input, phosphorusUnit: "ppm" }).nutrients[1];
  assert.equal(ppm.explanationCode, "INCOMPATIBLE_UNIT");
  assert.match(ppm.guidance, /ppm.*kg\/ha/);
});
