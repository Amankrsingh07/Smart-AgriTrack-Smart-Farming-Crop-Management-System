import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  agriculturalKnowledge,
  knowledgeManifest,
  knowledgeReleaseSchema,
  knowledgeCoverage,
  normalizeProtectionCrop,
  compareKnowledgeReleases,
  sourceInventorySchema,
} from "../src/lib/agricultural-knowledge";
import inventory from "../src/data/agriculture/source-inventory.json";
import { assessProtection, protectionSchema } from "../src/lib/crop-protection";
test("versioned knowledge passes schema, source mapping, duplicates and content hash checks", () => {
  assert.ok(agriculturalKnowledge.records.length > 24);
  assert.equal(
    new Set(agriculturalKnowledge.records.map((r) => r.id)).size,
    agriculturalKnowledge.records.length,
  );
  const item = knowledgeManifest.releases.find(
    (r) => r.version === knowledgeManifest.activeRelease,
  )!;
  assert.equal(
    createHash("sha256")
      .update(readFileSync(`src/data/agriculture/${item.path}`))
      .digest("hex"),
    item.sha256,
  );
  assert.equal(sourceInventorySchema.safeParse(inventory).success, true);
  assert.equal(
    knowledgeReleaseSchema.safeParse({
      ...agriculturalKnowledge,
      records: [
        ...agriculturalKnowledge.records,
        agriculturalKnowledge.records[0],
      ],
    }).success,
    false,
  );
  assert.equal(
    knowledgeReleaseSchema.safeParse({
      ...agriculturalKnowledge,
      records: [{ ...agriculturalKnowledge.records[0], sourceId: "invented" }],
    }).success,
    false,
  );
});
test("coverage and freshness never imply validated all-India diagnosis", () => {
  assert.equal(normalizeProtectionCrop("Rice (Paddy)"), "rice");
  assert.equal(normalizeProtectionCrop("Chickpea (Gram)"), "chickpea");
  assert.equal(knowledgeCoverage("Wheat").validatedDiagnosis, false);
  assert.equal(knowledgeCoverage("Unknown crop").records, 0);
  assert.equal(
    knowledgeCoverage("Tomato", new Date("2028-01-01")).reviewDue,
    true,
  );
  const before = structuredClone(agriculturalKnowledge);
  const after = structuredClone(before);
  after.records[0].diagnostics = "Updated diagnostics require review";
  assert.deepEqual(compareKnowledgeReleases(before, after).changed, [
    before.records[0].id,
  ]);
});
test("rules preserve preliminary source version and show conflicting application or root evidence", () => {
  const i = protectionSchema.parse({
    cropName: "Tomato",
    symptoms: ["Leaf curling"],
    affected: "10–25%",
    onset: "2026-01-01",
    spreading: false,
    pattern: "One section",
    timing: "Gradually",
    symptomsAfterApplication: true,
    pollution: [],
    fieldHistory: { soilMoisture: "Waterlogged" },
  });
  const r = assessProtection(i);
  assert.equal(r.method, "Offline rule-based assessment");
  assert.equal(
    r.diagnosisStatus,
    "Insufficient information for a reliable diagnosis.",
  );
  assert.ok(r.candidates[0].contradictions.length >= 2);
  assert.equal(r.candidates[0].datasetVersion, knowledgeManifest.activeRelease);
});
