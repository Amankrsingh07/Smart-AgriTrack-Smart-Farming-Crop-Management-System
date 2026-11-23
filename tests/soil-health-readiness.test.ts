import test from "node:test";
import assert from "node:assert/strict";
import { soilReadiness, suggestSoilReference } from "../src/lib/soil-health-readiness";
import { analyzeSoil, type SoilHealthInput } from "../src/lib/soil-health";

const reported: SoilHealthInput = { state: "Bihar", district: "Chhapra", crop: "Wheat", growthStage: "Vegetative", soilType: "Alluvial", nitrogenKgHa: 240, phosphorusKgHa: 18, potassiumKgHa: 150.09, organicCarbonPercent: 0.55, soilPh: 6.8, nutrientUnit: "kg/ha", phosphorusBasis: "P", potassiumBasis: "K", nitrogenMethod: "ALKALINE_KMNO4_N", phosphorusMethod: "OLSEN_P", potassiumMethod: "NEUTRAL_1N_NH4OAC_K", organicCarbonMethod: "WALKLEY_BLACK_OC", laboratoryName: "Recorded laboratory" };

test("regional suggestion fills only the reference, never lab evidence", () => {
  const before = structuredClone(reported);
  assert.equal(suggestSoilReference("Bihar"), "BIHAR_CSTL_GOI_2011");
  assert.equal(suggestSoilReference("Odisha", "BIHAR_CSTL_GOI_2011"), "ODISHA_GOI_2024");
  assert.equal(suggestSoilReference("Bihar", "BIHAR_CSTL_GOI_2011"), "BIHAR_CSTL_GOI_2011", "district-only edits preserve valid reference");
  assert.equal(suggestSoilReference("Rajasthan"), "UNKNOWN");
  assert.equal(suggestSoilReference("Punjab"), "UNKNOWN", "reference-only publications are not auto-selected");
  const result = analyzeSoil({ ...reported, referenceStandardId: suggestSoilReference(reported.state) });
  assert.equal(result.nutrients[0].rating, "Low", "verified screening does not require a lab identity/attestation");
  assert.equal(result.nutrients[2].rating, "Medium");
  assert.equal(result.nutrients[1].rating, "Unknown", "Olsen threshold scope still requires alkaline measured pH");
  assert.deepEqual(reported, before);
});

test("the reported missing-reference and pH-method case identifies actionable fields", () => {
  const checklist = soilReadiness(reported);
  assert.ok(checklist.some(item => item.key === "referenceStandardId"));
  assert.ok(checklist.some(item => item.key === "phMethod"));
  assert.ok(!checklist.some(item => item.key === "nitrogenMethod"), "existing measured metadata retained");
  const selected = soilReadiness({ ...reported, referenceStandardId: suggestSoilReference("Bihar") });
  assert.ok(selected.some(item => item.key === "labReferenceConfirmed"));
  assert.ok(selected.some(item => item.key === "phosphorusCondition"));
});

test("genuine missing lab data, methods, bases and units stay explicit rather than defaulted", () => {
  const checklist = soilReadiness({ ...reported, laboratoryName: "", nitrogenMethod: "", nutrientUnit: "UNKNOWN", phosphorusBasis: "UNKNOWN", potassiumBasis: "UNKNOWN" });
  for (const key of ["laboratoryName", "nitrogenMethod", "nutrientUnit", "phosphorusBasis", "potassiumBasis"]) assert.ok(checklist.some(item => item.key === key), key);
  assert.ok(soilReadiness({}).some(item => item.key === "readings"));
});

test("readiness never tells a farmer to change the recorded pH or mislabel oxides", () => {
  const checklist = soilReadiness({ ...reported, referenceStandardId: suggestSoilReference("Bihar"), labReferenceConfirmed: true, phMethod: "WATER_1_2_5", phosphorusBasis: "P2O5", nutrientUnit: "mg/kg" });
  assert.ok(!checklist.some(item => item.key === "phosphorusBasisMismatch"), "documented basis conversion is not a mismatch; incompatible concentration units remain blocked");
  assert.ok(checklist.some(item => item.key === "nitrogenUnitMismatch"));
  assert.match(checklist.find(item => item.key === "phosphorusCondition")!.message, /Reading badlein nahi/);
  assert.ok(soilReadiness({ ...reported, soilPh: 8, phMethod: "WATER_1_2_5", referenceStandardId: suggestSoilReference("Bihar"), labReferenceConfirmed: true }).length === 0);
});

test("pH-only reports expose required reference and confirmation rather than hiding genuine blockers",()=>{
 const input:SoilHealthInput={state:"Bihar",district:"Chhapra",crop:"Barley",growthStage:"Vegetative",soilType:"Alluvial",soilPh:6.5,phMethod:"WATER_1_2_5",laboratoryName:"Recorded lab"};
 assert.ok(soilReadiness(input).some(i=>i.key==="referenceStandardId"));
 const selected={...input,referenceStandardId:"BIHAR_CSTL_GOI_2011"};
 assert.ok(soilReadiness(selected).some(i=>i.key==="labReferenceConfirmed"));assert.equal(analyzeSoil(selected).ph.rating,"Slightly acidic");
 const confirmed={...selected,labReferenceConfirmed:true};assert.deepEqual(soilReadiness(confirmed),[]);assert.equal(analyzeSoil(confirmed).ph.rating,"Slightly acidic");
});
