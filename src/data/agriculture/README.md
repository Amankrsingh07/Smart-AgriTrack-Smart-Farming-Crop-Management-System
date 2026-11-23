# Agricultural knowledge releases

Active release: `2026-11-15.1`. Contains **24 preliminary symptom candidates**, not 24 validated diagnoses. Twenty older entries are explicitly PRELIMINARY_UNVALIDATED; four have source-linked differential descriptions. No expert/clinical accuracy validation, chemical prescription, universal soil contaminant threshold or trained image model is claimed.

`dataset-manifest.json` lists the active release, hash, aliases, missing coverage and review age. `source-inventory.json` records audited availability, scope, versions where known, rights uncertainty and ingestion restrictions. Public availability never implies unrestricted redistribution. Only authored short summaries and source links are bundled; full source documents/images are not included. No runtime arbitrary internet ingestion occurs.

Records are validated by `knowledgeReleaseSchema`; IDs, source mappings and release versions must be consistent. Unknown scientific names/publication dates stay empty/null rather than invented. All crops outside the named coverage get explicit general triage. Existing source-linked soil/fertilizer/calendar datasets are reused in their own services rather than copied into fictional crop profiles.

## Update review

1. Make a new versioned release directory; never overwrite an accepted release silently.
2. Record source URLs, access date, applicability and rights. Do not copy restricted documents. Author and review narrow summaries; do not turn article descriptions into calibrated confidence.
3. Run `node --import tsx scripts/review-agricultural-knowledge.ts path/to/candidate.json`. The read-only tool validates the schema and outputs added/removed/changed IDs and a SHA-256 hash; it does not publish.
4. A trusted maintainer/agricultural reviewer examines the diff, sources, rights and diagnostic limitations. Add relevant tests, update the manifest hash and the explicit bundled import in `src/lib/agricultural-knowledge.ts` through normal code review.
5. Run unit tests, typecheck, lint, build and isolated integration tests before release.
6. Keep previous release files. Roll back by restoring the reviewed manifest and import in version control. Historical assessment findings remain immutable and retain their original dataset version.

There is no client-triggered upload/publication API. A `CropProtectionExpertGrant` administrator can review reports, but cannot publish arbitrary code or rewrite source files through the application. Source-controlled release approval is an operational trust boundary, not a fabricated administrator dashboard.
