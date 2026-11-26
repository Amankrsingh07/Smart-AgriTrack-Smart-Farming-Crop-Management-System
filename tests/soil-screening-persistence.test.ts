import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSoil } from "../src/lib/soil-health";
import { soilHealthSchema } from "../src/lib/soil-health-validation";
import { draftFromSoilText } from "../src/lib/soil-local-scan";
import {
  savedSoilScreening,
  soilScreeningReason,
} from "../src/lib/saved-soil-screening";

const context = {
  state: "Bihar",
  district: "Saran",
  crop: "Wheat",
  growthStage: "Vegetative",
  soilType: "Alluvial",
  referenceStandardId: "BIHAR_CSTL_GOI_2011",
};

test("explicit report labels round-trip through validation and JSON with distinct units and oxide bases", () => {
  const draft = draftFromSoilText(
    [
      "Available Nitrogen: 280 KG / HA",
      "Available Phosphorus (as P₂O₅): 35 kg/ha",
      "Available Potassium (K): 75 kg/acre",
      "Soil pH: 8.2",
      "pH test method: Soil water (1 : 2.5)",
      "N test method: Alkaline permanganate",
      "P test method: Olsen bicarbonate method",
      "K test method: Neutral 1N ammonium acetate",
    ].join("\n"),
  );
  assert.ok(draft);
  const input = soilHealthSchema.parse({
    ...context,
    ...draft,
    nitrogenValue: draft.nitrogenKgHa,
    phosphorusValue: draft.phosphorusKgHa,
    potassiumValue: draft.potassiumKgHa,
  });
  assert.equal(input.phosphorusValue, 35);
  assert.equal(input.phosphorusUnit, "kg/ha");
  assert.equal(input.phosphorusBasis, "P2O5");
  assert.equal(input.phosphorusMethod, "Olsen bicarbonate method");
  assert.equal(input.phMethod, "WATER_1_2_5");
  const saved = JSON.parse(JSON.stringify(input));
  const report = analyzeSoil(saved);
  assert.deepEqual(report.nutrients.map((row) => row.rating), [
    "Medium",
    "Medium",
    "Medium",
  ]);
  assert.equal(report.nutrients[1].interpretation?.value, 15.295);
  assert.equal(report.ph.rating, "Slightly alkaline");
});

test("ambiguous reporting basis, incompatible methods and missing pH evidence withhold screening", () => {
  const draft = draftFromSoilText("Available Phosphorus: 35 kg/ha");
  assert.equal(draft?.phosphorusKgHa, 35);
  assert.equal(draft.phosphorusBasis, undefined);

  const input = soilHealthSchema.parse({
    ...context,
    ...draft,
    phosphorusMethod: "Olsen",
  });
  const legacy = { ...input, soilPh: null };
  assert.equal(
    savedSoilScreening(legacy, null).nutrients[1].explanationCode,
    "UNKNOWN_NUTRIENT_BASIS",
  );
  for (const method of ["Bray-1", "Mehlich-3 ICP", "Mehlich-3 colorimetric"]) {
    const p = analyzeSoil({
      ...input,
      phosphorusBasis: "P",
      phosphorusMethod: method,
    }).nutrients[1];
    assert.equal(p.rating, "Unknown");
    assert.equal(p.explanationCode, "REFERENCE_METHOD_MISMATCH");
  }
  const p = savedSoilScreening({ ...legacy, phosphorusBasis: "P" }, null)
    .nutrients[1];
  assert.equal(p.explanationCode, "OLSEN_SOIL_CONDITION");
  assert.match(soilScreeningReason(p), /Recorded pH: missing/);
});

test("legacy history can recover a verified rating while keeping modern saved results", () => {
  const input = soilHealthSchema.parse({
    ...context,
    phosphorusValue: 10,
    phosphorusUnit: "kg/ha",
    phosphorusBasis: "P",
    phosphorusMethod: "Olsen",
    soilPh: 8,
    phMethod: "WATER_1_2_5",
  });
  const report = analyzeSoil(input);
  const p = report.nutrients[1];
  assert.equal(p.rating, "Medium");
  const legacy = {
    nutrients: [
      { ...p, rating: "Unknown", guidance: "", explanationCode: undefined },
    ],
  };
  assert.equal(savedSoilScreening(input, legacy).nutrients[1].rating, "Medium");
  const obsolete = {
    nutrients: [
      {
        ...p,
        rating: "Unknown",
        guidance: "Laboratory identity required.",
        explanationCode: "MISSING_LAB_IDENTITY",
      },
    ],
  };
  const recovered = savedSoilScreening(
    { ...input, phosphorusBasis: "UNKNOWN" },
    obsolete,
  ).nutrients[1];
  assert.equal(recovered.explanationCode, "UNKNOWN_NUTRIENT_BASIS");
  assert.equal(savedSoilScreening(input, report).nutrients[1], p);
});
