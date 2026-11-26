import { z } from "zod";
import release from "../data/agriculture/releases/2026-11-18.1/knowledge.json";
import manifestFile from "../data/agriculture/dataset-manifest.json";
const nonempty = z.string().trim().min(1).max(4000);
export const knowledgeRecordSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: nonempty,
    scientificName: z.string(),
    crops: z.array(nonempty).min(1),
    category: nonempty,
    symptoms: z.array(nonempty).min(1),
    version: nonempty,
    sourceOrganization: nonempty,
    source: z.url(),
    sourceId: nonempty,
    diagnostics: nonempty,
    prevention: nonempty,
    management: nonempty,
    severity: nonempty,
    conditions: nonempty,
    causes: nonempty,
    publicationDate: z.iso.date().nullable(),
    datasetVersion: nonempty,
    geographicApplicability: nonempty,
    verificationStatus: z.enum([
      "PRELIMINARY_UNVALIDATED",
      "SOURCE_LINKED_SCREENING",
    ]),
    lastReviewed: z.iso.date(),
    units: z.string().nullable(),
    evidenceLimitations: nonempty,
    contradictoryEvidence: z.array(nonempty),
    affectedParts: z.array(nonempty),
    distinguishingSymptoms: z.array(nonempty).optional(),
    competingSymptoms: z.array(nonempty).optional(),
    recovery: nonempty.optional(),
  })
  .strict();
export const knowledgeSourceSchema = z
  .object({
    id: nonempty,
    organization: nonempty,
    url: z.url(),
    format: z.enum(["HTML", "PDF", "JSON API"]),
    availability: nonempty,
    publicationDate: z.iso.date().nullable(),
    version: z.string().nullable(),
    geographicCoverage: nonempty,
    cropCoverage: z.array(nonempty),
    license: nonempty,
    automatedDownloads: nonempty,
    updateFrequency: nonempty,
    lastChecked: z.iso.date(),
    verification: nonempty,
  })
  .strict();
export const knowledgeReleaseSchema = z
  .object({
    version: nonempty,
    records: z.array(knowledgeRecordSchema),
    sources: z.array(knowledgeSourceSchema),
  })
  .strict()
  .superRefine((data, ctx) => {
    for (const [kind, rows] of [
      ["record", data.records],
      ["source", data.sources],
    ] as const) {
      const seen = new Set<string>();
      for (const row of rows) {
        if (seen.has(row.id))
          ctx.addIssue({
            code: "custom",
            message: `Duplicate ${kind}: ${row.id}`,
          });
        seen.add(row.id);
      }
    }
    for (const r of data.records) {
      const source = data.sources.find((s) => s.id === r.sourceId);
      if (
        !source ||
        source.url !== r.source ||
        r.datasetVersion !== data.version
      )
        ctx.addIssue({
          code: "custom",
          message: `Invalid source/version mapping: ${r.id}`,
        });
    }
  });
export const knowledgeManifestSchema = z
  .object({
    version: nonempty,
    activeRelease: nonempty,
    reviewedOn: z.iso.date(),
    reviewAfterDays: z.number().int().positive(),
    publicationPolicy: nonempty,
    coverage: z.object({
      namedCrops: z.array(nonempty),
      aliases: z.record(z.string(), z.string()),
      missing: nonempty,
    }),
    releases: z.array(
      z.object({
        version: nonempty,
        path: nonempty,
        status: z.literal("BUNDLED_SCREENING"),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    ),
  })
  .strict();
export const knowledgeManifest = knowledgeManifestSchema.parse(manifestFile);
export const agriculturalKnowledge = knowledgeReleaseSchema.parse(release);
if (agriculturalKnowledge.version !== knowledgeManifest.activeRelease)
  throw new Error("Knowledge release does not match manifest");
export function normalizeProtectionCrop(value: string) {
  const key = value.trim().toLowerCase();
  return knowledgeManifest.coverage.aliases[key] ?? key;
}
export function knowledgeCoverage(crop: string, now = new Date()) {
  const normalized = normalizeProtectionCrop(crop);
  const candidates = agriculturalKnowledge.records.filter((d) =>
    d.crops.some((c) => normalizeProtectionCrop(c) === normalized),
  );
  const ageDays = Math.floor(
    (now.getTime() - Date.parse(knowledgeManifest.reviewedOn)) / 86400000,
  );
  return {
    version: agriculturalKnowledge.version,
    records: candidates.length,
    sourceLinkedRecords: candidates.filter(
      (c) => c.verificationStatus === "SOURCE_LINKED_SCREENING",
    ).length,
    validatedDiagnosis: false,
    reviewedOn: knowledgeManifest.reviewedOn,
    reviewDue: ageDays > knowledgeManifest.reviewAfterDays,
    limitation: knowledgeManifest.coverage.missing,
  };
}
export function compareKnowledgeReleases(
  before: z.infer<typeof knowledgeReleaseSchema>,
  after: z.infer<typeof knowledgeReleaseSchema>,
) {
  return {
    from: before.version,
    to: after.version,
    added: after.records
      .filter((r) => !before.records.some((b) => b.id === r.id))
      .map((r) => r.id),
    removed: before.records
      .filter((r) => !after.records.some((a) => a.id === r.id))
      .map((r) => r.id),
    changed: after.records
      .filter((r) =>
        before.records.some(
          (b) => b.id === r.id && JSON.stringify(b) !== JSON.stringify(r),
        ),
      )
      .map((r) => r.id),
  };
}

export const sourceInventorySchema = z
  .object({
    version: nonempty,
    sources: z.array(
      z
        .object({
          id: nonempty,
          organization: nonempty,
          url: z.url(),
          format: nonempty,
          coverage: nonempty,
          availability: nonempty,
          relevance: nonempty,
          license: nonempty,
          publicationDate: z.iso.date().nullable(),
          version: z.string().nullable(),
          automatedDownloads: nonempty,
          updateFrequency: nonempty,
          lastChecked: z.iso.date(),
        })
        .strict(),
    ),
  })
  .strict();
