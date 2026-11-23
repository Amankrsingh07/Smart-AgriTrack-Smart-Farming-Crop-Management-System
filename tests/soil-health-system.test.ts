import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSoil, type SoilHealthInput } from "../src/lib/soil-health";
import { soilHealthSchema } from "../src/lib/soil-health-validation";
import { soilLinkError } from "../src/lib/soil-health-links";
import { soilTrendGroups } from "../src/lib/soil-health-trends";
import { calculateCustomFertilizer } from "../src/lib/icar-fertilizer";

const base: SoilHealthInput = { state: "Bihar", district: "Saran", crop: "Wheat", growthStage: "Vegetative", soilType: "Alluvial", nitrogenKgHa: 240, phosphorusKgHa: 10, potassiumKgHa: 107, organicCarbonPercent: 0.3, soilPh: 8, nutrientUnit: "kg/ha", phosphorusBasis: "P", potassiumBasis: "K", nitrogenMethod: "ALKALINE_KMNO4_N", phosphorusMethod: "OLSEN_P", potassiumMethod: "NEUTRAL_1N_NH4OAC_K", organicCarbonMethod: "WALKLEY_BLACK_OC", phMethod: "WATER_1_2_5", laboratoryName: "Issuing laboratory", referenceStandardId: "BIHAR_CSTL_GOI_2011", labReferenceConfirmed: true };

test("optional readings stay unknown; a single pH or OC result can be submitted", () => {
  const context = { state: "Bihar", district: "Saran", crop: "Wheat", growthStage: "Vegetative", soilType: "Alluvial" };
  assert.equal(soilHealthSchema.safeParse(context).success, false);
  assert.equal(soilHealthSchema.safeParse({ ...context, organicCarbonPercent: 0 }).success, true);
  const result = analyzeSoil({ ...context, soilPh: 7 });
  assert.ok(result.nutrients.every(item => item.value === null && item.rating === "Unknown"));
  assert.equal(result.organicCarbon.value, null);
  assert.equal(result.ph.rating, "Unknown", "unknown pH method is never normal by default");
});

test("invalid dates, values, units and nutrient bases are rejected without coercing blank inputs", () => {
  for (const extra of [{ organicCarbonPercent: -1 }, { organicCarbonPercent: 100.1 }, { nitrogenKgHa: NaN }, { nitrogenKgHa: "" }, { soilPh: 14.1 }, { sampleDate: "2026-02-30" }, { sampleDate: "2999-01-01" }, { nutrientUnit: "bags" }, { phosphorusBasis: "K2O" }, { samplingDepthCm: 0 }]) assert.equal(soilHealthSchema.safeParse({ ...base, ...extra }).success, false, JSON.stringify(extra));
  assert.equal(soilHealthSchema.safeParse({ ...base, sampleDate: "2026-02-28" }).success, true);
  assert.equal(soilHealthSchema.safeParse({ ...base, laboratoryName: "" }).success, false);
});

test("regional reference, recorded methods and laboratory metadata are handled independently", () => {
  const matched = analyzeSoil(base);
  assert.equal(matched.nutrients[0].rating, "Low", "Direct N uses its own compatible assay");
  assert.equal(matched.nutrients[1].rating, "Medium");
  assert.equal(matched.nutrients[2].rating, "Low");
  assert.equal(matched.organicCarbon.rating, "Low");
  for (const extra of [{ state: "Punjab" }, { referenceStandardId: "UNKNOWN" }]) {
    const report = analyzeSoil({ ...base, ...extra });
    assert.ok(report.nutrients.every(item => item.rating === "Unknown"));
    assert.equal(report.organicCarbon.rating, "Unknown");
  }
  for (const extra of [{ labReferenceConfirmed: false }, { laboratoryName: "" }]) {
    const report = analyzeSoil({ ...base, ...extra });
    assert.deepEqual(report.nutrients.map(item => item.rating), ["Low", "Medium", "Low"]);
    assert.equal(report.organicCarbon.rating, "Low");
  }
  assert.equal(analyzeSoil({ ...base, phosphorusMethod: "" }).nutrients[1].rating, "Unknown");
});

test("elemental versus oxide nutrient bases and mg/kg are never treated as equivalent", () => {
  assert.equal(analyzeSoil({ ...base, phosphorusBasis: "P2O5" }).nutrients[1].rating, "Low");
  assert.equal(analyzeSoil({ ...base, potassiumBasis: "K2O" }).nutrients[2].rating, "Low");
  const concentration = analyzeSoil({ ...base, nutrientUnit: "mg/kg" });
  assert.equal(concentration.nutrients[1].rating, "Unknown");
  assert.equal(concentration.nutrients[2].rating, "Unknown");
  assert.equal(concentration.nutrients[1].unit, "mg/kg");
  const acreValue = 10 * 0.40468564224;
  assert.equal(analyzeSoil({ ...base, nutrientUnit: "kg/acre", phosphorusKgHa: acreValue }).nutrients[1].rating, "Medium");
});

test("published GOI boundaries remain exact without invented classes", () => {
  for (const [value, rating] of [[9.99, "Low"], [10, "Medium"], [24.6, "Medium"], [24.61, "High"]] as const) assert.equal(analyzeSoil({ ...base, phosphorusKgHa: value }).nutrients[1].rating, rating);
  assert.equal(analyzeSoil({ ...base, potassiumKgHa: 108 }).nutrients[2].rating, "Medium");
  assert.equal(analyzeSoil({ ...base, potassiumKgHa: 280.01 }).nutrients[2].rating, "High");
  assert.equal(analyzeSoil({ ...base, organicCarbonPercent: 0.5 }).organicCarbon.rating, "Medium");
  assert.equal(analyzeSoil({ ...base, organicCarbonPercent: 0.75 }).organicCarbon.rating, "Medium");
});

test("pH classification is method-specific and does not fill source rounding gaps", () => {
  for (const [value, rating] of [[4.4, "Strongly acidic"], [4.5, "Unknown"], [4.6, "Moderately acidic"], [5.55, "Unknown"], [5.6, "Slightly acidic"], [6.6, "Neutral"], [7.6, "Slightly alkaline"], [8.6, "Moderately alkaline"], [9.6, "Strongly alkaline"]] as const) assert.equal(analyzeSoil({ ...base, soilPh: value }).ph.rating, rating);
  assert.equal(analyzeSoil({ ...base, phMethod: "OTHER" }).ph.rating, "Unknown");
});

test("score stays insufficient even with complete readings when no validated composite model exists", () => {
  const report = analyzeSoil(base);
  assert.equal(report.score.value, null);
  assert.equal(report.score.label, "Insufficient data");
  assert.ok(report.recommendations.some(item => item.title.includes("Wheat")));
  assert.ok(report.recommendations.some(item => item.detail.includes("Never subtract")));
});

test("owned relationship validation rejects foreign IDs, mismatched farm, crop and cycle", () => {
  const input = { ...base, farmId: "farm", fieldId: "field", cropId: "crop", cropCycleId: "cycle" };
  const context = { farm: { id: "farm", state: "Bihar", district: "Saran" }, field: { id: "field", farmId: "farm", soilType: "Alluvial", farm: { state: "Bihar", district: "Saran" } }, crop: { id: "crop", name: "Wheat" }, cycle: { id: "cycle", fieldId: "field", cropId: "crop", crop: { name: "Wheat" } } };
  assert.equal(soilLinkError(input, context), null);
  assert.match(soilLinkError(input, { ...context, field: null })!, /not found/);
  assert.match(soilLinkError({ ...input, farmId: "another" }, context)!, /does not belong/);
  assert.match(soilLinkError({ ...input, cropId: "another" }, context)!, /same saved/);
  assert.match(soilLinkError({ ...input, crop: "Maize" }, context)!, /crop name/);
  assert.match(soilLinkError({ ...input, state: "Punjab" }, context)!, /location/);
  assert.match(soilLinkError({ ...input, soilType: "Sandy" }, context)!, /Soil type/);
});

test("trend series require exact field, method, depth, laboratory, unit and basis metadata", () => {
  const make = (id: string, overrides: Partial<SoilHealthInput> = {}) => ({ id, createdAt: "2026-11-14", result: { version: "smart-soil-v2" }, input: { ...base, fieldId: "field", sampleDate: id === "a" ? "2026-10-01" : "2026-11-01", samplingDepthCm: 15, ...overrides } });
  const records = [make("a"), make("b", { phosphorusKgHa: 7 }), make("other-basis", { phosphorusBasis: "P2O5" }), make("other-unit", { nutrientUnit: "mg/kg" }), make("other-lab", { laboratoryName: "Other lab" }), make("other-method", { phosphorusMethod: "Bray" }), make("other-depth", { samplingDepthCm: 30 }), make("other-field", { fieldId: "different" }), make("unknown", { phosphorusMethod: "" }), make("missing", { phosphorusKgHa: undefined }), { ...make("legacy"), result: {} }];
  const groups = soilTrendGroups(records, "field", "phosphorusKgHa");
  assert.equal(groups.length, 6);
  assert.equal(groups.find(group => group.points.length === 2)?.points.at(-1)?.value, 7);
  assert.equal(soilTrendGroups(records, "", "phosphorusKgHa").length, 0);
  assert.equal(soilTrendGroups([make("undated", { sampleDate: undefined })], "field", "phosphorusKgHa").length, 0);
});

test("existing offline custom fertilizer formula and ICAR schedules remain independent of soil analysis", () => {
  const manual = calculateCustomFertilizer({ nitrogenKgHa: 120, phosphorusP2O5KgHa: 60, potassiumK2OKgHa: 40, areaHa: 2, basalNitrogenPercent: 50, basalPhosphorusPercent: 100, basalPotassiumPercent: 100, topdressLabel: "First irrigation" })!;
  assert.ok(Math.abs(manual.total.dap - (60 / 0.46) * 2) < 1e-9);
  assert.ok(Math.abs(manual.total.urea - ((120 - (60 / 0.46) * 0.18) / 0.46) * 2) < 1e-9);
  assert.ok(Math.abs(manual.schedule.reduce((sum, row) => sum + row.urea, 0) - manual.total.urea) < 1e-9);
});
