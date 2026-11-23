/** Explicit provenance only: never guess that historical readings are synthetic from their numbers. */
export type SoilProvenance = { mode?: string; synthetic?: boolean; demoFixtureId?: string | null; dataLabel?: string };
export function isDemoSoilSample(input?: SoilProvenance | null, report?: SoilProvenance | null) {
  return [input, report].some(value => value?.mode === "DEMO" || value?.synthetic === true || !!value?.demoFixtureId || value?.dataLabel === "DEMO DATA");
}
export function soilSampleLabel(input?: SoilProvenance | null, report?: SoilProvenance | null) {
  return isDemoSoilSample(input, report) ? "DEMO DATA" : input?.mode === "REAL" || report?.mode === "REAL" ? "REAL LABORATORY MODE" : "LEGACY · sample origin not recorded";
}
