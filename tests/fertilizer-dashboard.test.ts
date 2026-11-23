import test from "node:test";
import assert from "node:assert/strict";
import { dashboardSoilInput, dashboardStandard, matchingFertilizerRecords } from "../src/lib/fertilizer-dashboard";
import { explainFertilizer } from "../src/lib/fertilizer-explanation";
import { extractSoilDraft } from "../src/lib/soil-report-extraction";
import { analyzeSoil, type SoilHealthInput } from "../src/lib/soil-health";
import { verifiedFertilizerProducts } from "../src/lib/fertilizer-product-grades";
import { fertilizerAdvisories } from "../src/lib/fertilizer-advisories";

const cycle: SoilHealthInput = { fieldId: "field-a", cropCycleId: "cycle-a", crop: "Wheat", state: "Bihar", district: "Saran", fieldAreaHa: 1, growthStage: "Vegetative", soilType: "Alluvial", season: "RABI" };

test("saved soil is scoped to the field and a real sample and retains the scientific dose gate", () => {
  const row = { fieldId: cycle.fieldId!, input: { ...cycle, mode: "REAL", nitrogenKgHa: 150 }, result: {} };
  const input = dashboardSoilInput(row, cycle);
  assert.ok(input);
  assert.equal(analyzeSoil(input).fertilizerAssessment.numericalRecommendation, null);
  assert.equal(dashboardSoilInput({ ...row, fieldId: "foreign" }, cycle), null);
  assert.equal(dashboardSoilInput({ ...row, result: { synthetic: true } }, cycle), null);
  assert.equal(dashboardSoilInput({ ...row, input: { ...row.input, mode: undefined } }, cycle), null);
  assert.equal(dashboardSoilInput({ ...row, input: {} }, cycle), null);
});

const provider = (content: object) => (async () => Response.json({
  candidates: [{ content: { parts: [{ text: JSON.stringify(content) }] } }],
})) as typeof fetch;

test("Gemini explanations fall back when a response proposes an unsupported dose", async () => {
  const offline = "स्थानीय कृषि सलाह की पुष्टि करें।";
  const source = { conditions: "Regional source", timing: ["At sowing"] };
  assert.deepEqual(await explainFertilizer(source, "hi", offline, {}), { online: false, text: offline });
  const options = { apiKey: "mock", model: "mock" };
  const response = await explainFertilizer(source, "hi", offline, {
    ...options,
    fetcher: provider({ text: "Use 20 kg instead of the local rate." }),
  });
  assert.deepEqual(response, { online: false, text: offline });
});

test("report extraction returns a draft with no verification fields", async () => {
  const options = { apiKey: "mock", model: "mock", fetcher: provider({ nitrogenKgHa: 120, nutrientUnit: "kg/ha", labReferenceConfirmed: true, referenceStandardId: "fake" }) };
  const file = new Uint8Array([1]);
  assert.deepEqual(await extractSoilDraft(file, "application/pdf", options), { nitrogenKgHa: 120, nutrientUnit: "kg/ha" });
  assert.equal(await extractSoilDraft(file, "application/pdf", {}), null);
  assert.equal(await extractSoilDraft(file, "image/jpeg", { ...options, fetcher: provider({ nutrientUnit: "unsupported" }) }), null);
});

test("the new organic reference is scoped to its source region and never supplies a dose", () => {
  assert.deepEqual(fertilizerAdvisories(cycle), []);
  const rice = { ...cycle, crop: "Rice (Paddy)", district: "East Champaran", season: "KHARIF" as const };
  assert.equal(fertilizerAdvisories(rice).length, 1);
  assert.equal(dashboardStandard(rice, false, "wheat-bihar-rabi").calculation, null);
});

test("matching fertilizer records are flagged without treating different grades or organic entries as duplicates", () => {
  const product = { name: "Urea", composition: verifiedFertilizerProducts.Urea, organic: false };
  const records = [product, { ...product, name: " urea " }, { ...product, organic: true },
    { ...product, composition: verifiedFertilizerProducts.DAP }];
  assert.deepEqual(matchingFertilizerRecords(records), [{ name: "Urea", count: 2 }]);
  assert.equal(records.length, 4);
});
