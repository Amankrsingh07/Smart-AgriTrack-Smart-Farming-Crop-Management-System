import { canConvertNutrientBasis, convertNutrientBasis } from "./nutrient-basis";
import { isDemoSoilSample } from "./soil-sample-mode";
import registry from "@/data/soil-lab-standards.json";
import type { SoilHealthInput } from "./soil-health";

export const soilLabMethods = {
  nitrogen: [{ id: "ALKALINE_KMNO4_N", label: "Alkaline KMnO₄ available N (Subbiah & Asija)" }],
  phosphorus: [{ id: "OLSEN_P", label: "Olsen bicarbonate-extractable P" }],
  potassium: [{ id: "NEUTRAL_1N_NH4OAC_K", label: "Neutral 1N ammonium acetate-extractable K" }],
  organicCarbon: [{ id: "WALKLEY_BLACK_OC", label: "Walkley–Black volumetric organic carbon (1934)" }],
} as const;
export function soilLabMethodLabel(value: string | undefined) {
  if (!value) return "Unknown";
  for (const methods of Object.values(soilLabMethods)) {
    const matched = methods.find(item => item.id === value || item.label === value);
    if (matched) return matched.label;
  }
  return value;
}
export type SoilParameter = keyof typeof soilLabMethods;
export type SoilReferenceId = "UNKNOWN" | typeof registry.standards[number]["id"];
type Band = { label: string; min: number; max: number | null; minInclusive: boolean; maxInclusive: boolean };
export type InterpretationRule = { parameter: string; methods: string[]; basis: string; unit: string; bands: Band[]; classificationEnabled: boolean; sourceSection?: string; allowBasisConversion?: boolean; requiresAlkalineWaterPh?: boolean };
export type SoilStandard = { id: string; name: string; states: string[]; version: string; source: string; url: string; scope: string; methodRequirement: string; note: string; classificationEnabled: boolean; rules: InterpretationRule[]; regionalSource?: string; regionalUrl?: string };
export const soilStandards: SoilStandard[] = registry.standards;
const normalize = (value: string) => value.trim().toLowerCase().replace(/[’']/g, "").replace(/[₀-₉]/g, char => String(char.charCodeAt(0) - 0x2080)).replace(/[^a-z0-9]/g, "");
// Exact, reviewed aliases only: total N, Bray/Mehlich P, non-neutral acetate and modified OC assays never match by substring.
const aliases: Record<string, string[]> = {
  ALKALINE_KMNO4_N: ["ALKALINE_KMNO4_N", "Alkaline permanganate", "Alkaline permanganate method", "Alkaline KMnO4", "Subbiah and Asija (1956)"],
  OLSEN_P: ["OLSEN_P", "Olsen", "Olsen's method", "Olsen P"],
  NEUTRAL_1N_NH4OAC_K: ["NEUTRAL_1N_NH4OAC_K", "Neutral 1N ammonium acetate", "Neutral normal ammonium acetate"],
  WALKLEY_BLACK_OC: ["WALKLEY_BLACK_OC", "Walkley and Black (1934)", "Walkley-Black (1934)", "Walkley and Black", "Walkley-Black"],
};
export function canonicalSoilMethod(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  // The exact labels exposed by our own method selector represent the same
  // reviewed assays as their IDs. Do not broaden this to substring matching.
  const published = Object.values(soilLabMethods).flat().find(method => normalize(method.label) === normalize(value));
  if (published) return published.id;
  return Object.entries(aliases).find(([, values]) => values.some(alias => normalize(alias) === normalize(value)))?.[0] ?? null;
}
export function matchingBand(value: number, bands: Band[]) {
  return bands.find(band => (band.minInclusive ? value >= band.min : value > band.min) && (band.max === null || (band.maxInclusive ? value <= band.max : value < band.max)));
}
export function availableSoilStandards(state: string) {
  return soilStandards.filter(standard => standard.states.some(region => normalize(region) === normalize(state === "Orissa" ? "Odisha" : state)));
}
const fields = { nitrogen: "nitrogenMethod", phosphorus: "phosphorusMethod", potassium: "potassiumMethod", organicCarbon: "organicCarbonMethod" } as const;
export function interpretSoilParameter(input: SoilHealthInput, parameter: SoilParameter, value: number | null, basis: string, unit: string) {
  const demo = isDemoSoilSample(input);
  const unknown = (explanationCode: string, guidance: string) => ({ rating: "Unknown", range: "Not applicable", explanationCode, guidance });
  if (value === null || !Number.isFinite(value) || value < 0) return unknown("MISSING_READING", "Laboratory reading is missing; it is not assumed normal.");
  const regional = availableSoilStandards(input.state);
  if (!regional.length) return unknown("UNSUPPORTED_REGION", `No verified interpretation reference is configured for ${input.state}. A reference from another state is not substituted.`);
  const standard = regional.find(reference => reference.id === input.referenceStandardId);
  if (!standard) return unknown("REFERENCE_REGION_MISMATCH", "No compatible regional reference was selected, or the selected reference belongs to another region.");
  // Laboratory name and its applicability attestation are retained for audit.
  // Once the recorded method, basis, unit, region and verified threshold rule
  // match, identity alone must not suppress the analytical screening class.
  if (!standard.classificationEnabled) return unknown("UNVERIFIED_METHOD_MAPPING", `${standard.name}: analytical-method mapping has not been verified. A checkbox or free-text method cannot establish equivalence. Existing saved reports are preserved.`);
  if (basis === "UNKNOWN") return unknown("UNKNOWN_NUTRIENT_BASIS", "Nutrient reporting basis is unknown. Elemental P/K must not be assumed equivalent to P₂O₅/K₂O.");
  if (!unit || unit === "UNKNOWN") return unknown("UNKNOWN_UNIT", "Laboratory measurement unit is missing; no unit is inferred for classification.");
  const method = canonicalSoilMethod(input[fields[parameter]]);
  if (!method) return unknown("UNSUPPORTED_METHOD", "Laboratory method is missing or not an exact supported method. Copy the method from the report; total nutrients and other extractants cannot be substituted.");
  const rule = standard.rules.find(candidate => candidate.parameter === parameter && candidate.classificationEnabled && candidate.methods.includes(method));
  if (!rule) return unknown("REFERENCE_METHOD_MISMATCH", `The selected reference has no validated ${parameter} rule for recorded method ${method}.`);
  if (basis !== rule.basis && !(rule.allowBasisConversion && canConvertNutrientBasis(basis, rule.basis))) return unknown("NUTRIENT_BASIS_MISMATCH", `Recorded nutrient basis ${basis} does not match reference basis ${rule.basis}. No reviewed chemical-basis conversion is enabled for this rule.`);
  let unitFactor = 1;
  if (unit !== rule.unit) {
    if (unit === "kg/acre" && rule.unit === "kg/ha") unitFactor = 1 / 0.40468564224;
    else return unknown("INCOMPATIBLE_UNIT", `Recorded unit ${unit} is incompatible with reference unit ${rule.unit}. No concentration-to-area conversion is assumed.`);
  }
  if (rule.requiresAlkalineWaterPh && !(input.phMethod === "WATER_1_2_5" && typeof input.soilPh === "number" && input.soilPh > 7 && input.soilPh <= 14)) {
    // A chemical-basis audit remains useful even when the reference is rejected.
    // It is deliberately separate from `interpretation` and supplies no class.
    const reportingBasisConversion = convertNutrientBasis(value, basis, rule.basis);
    return {
      ...unknown("OLSEN_SOIL_CONDITION", "This Olsen P reference applies to alkaline soil. A recorded alkaline pH (>7) measured in soil:water 1:2.5 is required; pH is not inferred from soil type."),
      applicabilityExplanation: `The selected Olsen P reference ${standard.id} (${standard.version}) requires soil pH >7 measured in soil:water 1:2.5. Recorded pH: ${input.soilPh ?? "missing"}; pH method: ${input.phMethod ?? "missing"}. Recorded phosphorus: ${value} ${unit} (${basis})${reportingBasisConversion.converted ? `; chemical reporting-basis conversion only: ${value} × ${reportingBasisConversion.factor} = ${reportingBasisConversion.value} ${unit} (${rule.basis}), ${reportingBasisConversion.reference!.title}` : ""}. Original laboratory reading retained. Conversion does not establish method equivalence or reference applicability. This is a restriction of the selected interpretation table, not a claim that Olsen analysis is universally invalid at this pH. Obtain issuing-laboratory-confirmed Olsen interpretation thresholds applicable to this soil/pH, reporting basis and region; confirmation alone cannot override this table's scope. Source: ${standard.url}, ${rule.sourceSection ?? ""}.`,
      reportingBasisConversion,
      rejectedReference: { id: standard.id, version: standard.version, url: standard.url, sourceSection: rule.sourceSection ?? "", requiredCondition: "Soil pH >7, soil:water 1:2.5", recordedPh: input.soilPh ?? null, recordedPhMethod: input.phMethod ?? null },
    };
  }
  const basisConversion = convertNutrientBasis(value, basis, rule.basis);
  const interpreted = basisConversion.value * unitFactor;
  const interpretation = { value: interpreted, unit: rule.unit, basis: rule.basis, original: { value, unit, basis }, unitFactor, basisConversion };
  const band = matchingBand(interpreted, rule.bands);
  if (basisConversion.converted && (!band || matchingBand(basisConversion.minimum * unitFactor, rule.bands)?.label !== band.label || matchingBand(basisConversion.maximum * unitFactor, rule.bands)?.label !== band.label)) return { ...unknown("CONVERSION_BOUNDARY_UNCERTAINTY", "Published chemical-basis factors are rounded and this conversion straddles a reference boundary. Obtain the laboratory's elemental result or a higher-precision documented conversion before assigning a class."), interpretation };
  if (!band) return unknown("OUTSIDE_REFERENCE_INTERVALS", "The result lies outside the documented threshold intervals; no missing boundary is invented.");
  const range = rule.bands.map(b => `${b.label}: ${b.minInclusive ? "≥" : ">"}${b.min}${b.max === null ? "" : ` to ${b.maxInclusive ? "≤" : "<"}${b.max}`}`).join("; ") + ` ${rule.unit} (${rule.basis})`;
  return {
    interpretation, rating: band.label, range, explanationCode: "COMPATIBLE_REFERENCE",
    guidance: `${band.label}: recorded ${value} ${unit} (${basis}); interpreted as ${interpreted.toFixed(4)} ${rule.unit} with exact method ${method}, region ${input.state}, verified reference ${standard.id}, version ${standard.version}.${demo ? " DEMO DATA; this is not a laboratory result." : ""} ${standard.scope}.${basisConversion.converted ? ` Reporting-basis conversion: ${value} ${unit} (${basis}) × ${basisConversion.factor} = ${basisConversion.value} ${unit} (${rule.basis}); source ${basisConversion.reference!.id}, printed p.190. Original reading retained; rounded source factors do not change the extraction method.` : ""} This is not a fertilizer recommendation.`,
    sourceUrl: standard.url,
    reference: { id: standard.id, version: standard.version, registryVersion: registry.version, source: standard.source, url: standard.url, regionalSource: standard.regionalSource ?? standard.source, regionalUrl: standard.regionalUrl ?? standard.url, region: input.state, method, basis: rule.basis, unit: rule.unit, thresholds: rule.bands, scope: standard.scope, sourceSection: rule.sourceSection ?? "" },
  };
}
export const soilPhReference = registry.phSource;
