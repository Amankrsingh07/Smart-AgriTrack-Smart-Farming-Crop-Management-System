import test from "node:test";
import assert from "node:assert/strict";
import { savedCropSoilAdvice, uniqueWaterReferences } from "../src/lib/saved-crop-soil-advice";
import { explainSoilReference } from "../src/lib/soil-advice-online";

const input = { crop: "Wheat", soil: "Alluvial", state: "Bihar", district: "Chhapra", ph: null, texture: null };

test("Bihar wheat gets soil context without inventing measured deficiencies or a pH optimum", () => {
  const advice = savedCropSoilAdvice(input);
  assert.match(advice.summary, /loam/);
  assert.match(advice.regional, /not confirmed/);
  assert.equal(advice.phRange, null);
  assert.match(advice.phMessage, /not recorded/);
  assert.ok(advice.sources.some(source => source.url.includes("icar.gov.in")));
});

test("maize compares actual pH with the documented optimum; unknown crops stay unknown", () => {
  assert.match(savedCropSoilAdvice({ ...input, crop: "Maize", ph: 8.1 }).phMessage, /outside/);
  assert.match(savedCropSoilAdvice({ ...input, crop: "Maize", ph: 6.5 }).phMessage, /within/);
  const missing = savedCropSoilAdvice({ ...input, crop: "Unknown crop", state: "Punjab" });
  assert.match(missing.summary, /not yet available/);
  assert.match(missing.regional, /No regional/);
  assert.equal(missing.phRange, null);
});

test("water references remove duplicates while keeping different study methods and locations", () => {
  const water = { period: "Full season", measure: "Irrigation", valueMm: "300–350", sourceUrl: "https://example.com/study", method: "Surface", scope: "Delhi" };
  assert.equal(uniqueWaterReferences([{ ...water, method: null, scope: null }, water]).length, 1);
  assert.equal(uniqueWaterReferences([water, { ...water }, { ...water, method: "Drip" }, { ...water, scope: "Bihar" }]).length, 3);
});

test("online provider output is validated and fails closed on invented quantities", async () => {
  const mock = (tips: string[]): typeof fetch => async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ tips }) }] } }] }), { status: 200 });
  const valid = await explainSoilReference(input, savedCropSoilAdvice(input), "test", "test", mock(["Check your field drainage before irrigation.", "Get a soil report before choosing nutrient inputs."]));
  assert.equal(valid.tips.length, 2);
  await assert.rejects(explainSoilReference(input, savedCropSoilAdvice(input), "test", "test", mock(["Apply 50 kg fertilizer per acre.", "Check your drainage before irrigation."])));
  await assert.rejects(explainSoilReference(input, savedCropSoilAdvice(input), "test", "test", async () => new Response("unavailable", { status: 503 })));
});
