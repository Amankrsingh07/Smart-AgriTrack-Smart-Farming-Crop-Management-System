import test from "node:test";
import assert from "node:assert/strict";
import { soilDemoFixtures, soilDemoInput } from "../src/lib/soil-demo";
import { analyzeSoil } from "../src/lib/soil-health";
import { soilHealthSchema } from "../src/lib/soil-health-validation";
import { isDemoSoilSample, soilSampleLabel } from "../src/lib/soil-sample-mode";
import { soilTrendGroups } from "../src/lib/soil-health-trends";

for (const fixture of soilDemoFixtures) test(`documented DEMO DATA fixture: ${fixture.id}`, () => {
  const input = soilHealthSchema.parse(soilDemoInput(fixture.id));
  const report = analyzeSoil(input);
  assert.equal(input.dataLabel, "DEMO DATA");
  assert.equal(input.synthetic, true);
  assert.equal(input.labReferenceConfirmed, false);
  assert.equal(input.laboratoryName, "");
  assert.equal(report.dataLabel, "DEMO DATA");
  assert.equal(report.laboratoryConfirmed, false);
  assert.equal(report.mode, "DEMO");
  assert.deepEqual([...report.nutrients.map(row => row.rating), report.organicCarbon.rating, report.ph.rating], [fixture.expected.nitrogen, fixture.expected.phosphorus, fixture.expected.potassium, fixture.expected.organicCarbon, fixture.expected.ph]);
  for (const row of [...report.nutrients, report.organicCarbon]) assert.doesNotMatch(row.guidance, /laboratory-confirmed/);
  assert.equal(report.score.label, "Insufficient data");
  assert.equal(report.score.value, null);
});

test("demo mode does not bypass reference, method, basis, unit or Olsen soil conditions", () => {
  const base = soilDemoInput();
  for (const extra of [{ state: "Rajasthan" }, { referenceStandardId: "UNKNOWN" }, { nutrientUnit: "mg/kg" as const }]) assert.ok(analyzeSoil({ ...base, ...extra }).nutrients.every(row => row.rating === "Unknown" && row.guidance.length > 10));
  assert.equal(analyzeSoil({ ...base, phosphorusBasis: "P2O5" }).nutrients[1].rating, "Low");
  assert.equal(analyzeSoil({ ...base, phosphorusMethod: "Bray" }).nutrients[1].rating, "Unknown");
  const neutral = analyzeSoil({ ...base, soilPh: 6.8 });
  assert.equal(neutral.nutrients[1].rating, "Unknown");
  assert.match(neutral.nutrients[1].guidance, /alkaline/);
  assert.equal(analyzeSoil({ ...base, phMethod: "OTHER" }).ph.rating, "Unknown");
});

test("real mode can screen compatible readings without requiring lab identity", () => {
  const base = soilDemoInput();
  delete base.demoFixtureId;
  const real = { ...base, mode: "REAL" as const, synthetic: false, dataLabel: "REAL LABORATORY MODE", laboratoryName: "Issuing laboratory" };
  const pending = analyzeSoil(real);
  assert.ok(pending.nutrients.every(row => row.rating === "Medium"));
  assert.equal(pending.ph.rating, "Slightly alkaline");
  assert.equal(pending.ph.laboratoryVerified, true);
  const confirmed = analyzeSoil({ ...real, labReferenceConfirmed: true });
  assert.ok(confirmed.nutrients.every(row => row.rating === "Medium"));
  assert.equal(confirmed.ph.rating, "Slightly alkaline");
  assert.equal(confirmed.laboratoryConfirmed, true);
  assert.equal(analyzeSoil({ ...real, labReferenceConfirmed: true, referenceStandardId: "ODISHA_GOI_2024" }).ph.rating, "Slightly alkaline");
});

test("API validation cannot promote flagged synthetic samples to real or attach lab confirmation", () => {
  const input = soilDemoInput();
  assert.equal(soilHealthSchema.safeParse({ ...input, labReferenceConfirmed: true }).success, false);
  assert.equal(soilHealthSchema.safeParse({ ...input, mode: "REAL" }).success, false);
  assert.equal(soilHealthSchema.safeParse({ ...input, fieldId: "real-field" }).success, false);
  assert.equal(soilHealthSchema.safeParse({ ...input, cropCycleId: "real-cycle" }).success, false);
  const normalized = soilHealthSchema.parse({ ...input, laboratoryName: "Synthetic lab", reportNumber: "Fake number" });
  assert.equal(normalized.laboratoryName, "");
  assert.equal(normalized.reportNumber, "");
  assert.equal(analyzeSoil({ ...input, mode: "REAL", labReferenceConfirmed: true }).laboratoryConfirmed, false, "defensive direct calls remain demo");
});

test("known synthetic reports are excluded from real trend series and legacy origin is never guessed", () => {
  const demo = { ...soilDemoInput(), fieldId: "field", laboratoryName: "Lab", sampleDate: "2026-10-01", samplingDepthCm: 15 };
  const rows = [{ id: "demo", createdAt: "2026-10-01", input: demo, result: analyzeSoil(demo) }];
  assert.equal(soilTrendGroups(rows, "field", "nitrogenKgHa").length, 0);
  assert.equal(soilSampleLabel(demo), "DEMO DATA");
  assert.equal(soilSampleLabel({ synthetic: true }), "DEMO DATA");
  assert.equal(soilSampleLabel({}, { mode: "DEMO" }), "DEMO DATA");
  assert.equal(soilSampleLabel({}), "LEGACY · sample origin not recorded");
  assert.equal(isDemoSoilSample({}), false);
  assert.equal(isDemoSoilSample({}, { synthetic: true }), true);
});
