import type { NutritionSample } from "./nutrition-evidence";
import type { SupplementalSoilReading } from "./soil-supplemental-readings";
import { nutrientDiagnostics, soilParameterDiagnostic } from "./soil-validation-diagnostics";
import { assessSoilFertilizer } from "./soil-fertilizer-assessment";
import type { NutrientBasisConversion } from "./nutrient-basis";
import { isDemoSoilSample } from "./soil-sample-mode";
import legacyReference from "@/data/soil-health-reference.json";
import { availableSoilStandards, interpretSoilParameter, matchingBand, soilPhReference } from "./soil-reference-matching";
import { savedCropSoilAdvice } from "./saved-crop-soil-advice";
import { matchScientificDoses } from "./scientific-dose-registry";
import { doseSources } from "./scientific-dose-registry";

/** Legacy keys are kept for saved reports/API compatibility. Their units are always declared by nutrientUnit. */
export type SoilHealthInput = {
  mode?: "REAL" | "DEMO"; synthetic?: boolean; demoFixtureId?: string; dataLabel?: string;
  state: string; district: string; crop: string; growthStage: string; soilType: string;
  nitrogenKgHa?: number; phosphorusKgHa?: number; potassiumKgHa?: number;
  /** New reports use neutral value keys so concentration units are never mislabeled kg/ha. */
  nitrogenValue?: number; phosphorusValue?: number; potassiumValue?: number;
  soilPh?: number; organicCarbonPercent?: number;
  scannerEvidence?: { source: "PDF text" | "Image OCR" | "Scanned PDF OCR (page 1)" | "PDF text and OCR"; evidence: string };
  nutritionSamples?: NutritionSample[];
  supplementalReadings?: SupplementalSoilReading[];
  season?: "KHARIF" | "RABI" | "ZAID";
  barleyUse?: "UNKNOWN" | "FEED" | "MALT" | "HULLESS" | "DUAL_PURPOSE"; waterRegime?: "UNKNOWN" | "IRRIGATED" | "RAINFED"; sowingCondition?: "UNKNOWN" | "TIMELY" | "LATE";
  nutrientUnit?: "kg/ha" | "kg/acre" | "mg/kg" | "UNKNOWN";
  nitrogenUnit?: "kg/ha" | "kg/acre" | "mg/kg" | "ppm" | "UNKNOWN";
  phosphorusUnit?: "kg/ha" | "kg/acre" | "mg/kg" | "ppm" | "UNKNOWN";
  potassiumUnit?: "kg/ha" | "kg/acre" | "mg/kg" | "ppm" | "UNKNOWN";
  phosphorusBasis?: "P" | "P2O5" | "UNKNOWN"; potassiumBasis?: "K" | "K2O" | "UNKNOWN";
  nitrogenMethod?: string; phosphorusMethod?: string; potassiumMethod?: string; organicCarbonMethod?: string;
  phMethod?: "WATER_1_2_5" | "OTHER" | "UNKNOWN";
  laboratoryName?: string; reportNumber?: string; referenceStandardId?: string; labReferenceConfirmed?: boolean;
  fieldAreaHa?: number; samplingDepthCm?: number; sampleDate?: string; reportDate?: string; farmId?: string; fieldId?: string; cropId?: string; cropCycleId?: string;
};
export type SoilRating = { applicabilityExplanation?: string; reportingBasisConversion?: NutrientBasisConversion; rejectedReference?: { id: string; version: string; url: string; sourceSection: string; requiredCondition: string; recordedPh: number | null; recordedPhMethod: string | null }; interpretation?: { value: number; unit: string; basis: string; original: { value: number; unit: string; basis: string }; unitFactor: number; basisConversion: NutrientBasisConversion }; explanationCode?: string; name: string; value: number | null; unit: string; rating: string; range: string; guidance: string; method: string; basis: string; sourceUrl?: string; reference?: { id: string; version: string; registryVersion: string; source: string; url: string; regionalSource: string; regionalUrl: string; region: string; method: string; basis: string; unit: string; thresholds: { label: string; min: number; max: number | null; minInclusive: boolean; maxInclusive: boolean }[]; scope: string; sourceSection: string } };
const valid = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value >= 0;


export function analyzeSoil(input: SoilHealthInput) {
  const demo = isDemoSoilSample(input);
  const standard = availableSoilStandards(input.state).find(item => item.id === input.referenceStandardId);
  const confirmed = !demo && !!standard && input.labReferenceConfirmed === true && !!input.laboratoryName?.trim();
  const status = (name: string, value: number | undefined, unit: string, basis: string, method: string | undefined): SoilRating => ({
    name, value: valid(value) ? value! : null, unit, basis, method: method || "Unknown", rating: "Unknown", range: "Not applicable",
    guidance: !valid(value) ? "Laboratory reading is missing; not assumed normal." : "A compatible verified reference, reporting basis, unit and laboratory method are needed for classification.",
  });
  const unitFor = (specific: SoilHealthInput["nitrogenUnit"]) => specific && specific !== "UNKNOWN" ? specific : input.nutrientUnit ?? "UNKNOWN";
  const n = status("Available nitrogen (N)", input.nitrogenValue ?? input.nitrogenKgHa, unitFor(input.nitrogenUnit), "N", input.nitrogenMethod);
  const p = status("Available phosphorus (P)", input.phosphorusValue ?? input.phosphorusKgHa, unitFor(input.phosphorusUnit), input.phosphorusBasis ?? "UNKNOWN", input.phosphorusMethod);
  const k = status("Available potassium (K)", input.potassiumValue ?? input.potassiumKgHa, unitFor(input.potassiumUnit), input.potassiumBasis ?? "UNKNOWN", input.potassiumMethod);
  const oc = { ...status("Organic carbon", input.organicCarbonPercent, "%", "OC", input.organicCarbonMethod), unit: "%" };
  for (const [parameter, row] of [["nitrogen", n], ["phosphorus", p], ["potassium", k], ["organicCarbon", oc]] as const) {
    Object.assign(row, interpretSoilParameter(input, parameter, row.value, row.basis, row.unit));
  }
  let phRating = "Unknown";
  const phValue = valid(input.soilPh) && input.soilPh! <= 14 ? input.soilPh! : null;
  if (phValue !== null && input.phMethod === soilPhReference.method) {
    phRating = matchingBand(phValue, soilPhReference.bands)?.label ?? "Unknown";
  }
  const phCode = phValue === null ? "MISSING_READING" : input.phMethod !== soilPhReference.method ? "UNSUPPORTED_METHOD" : phRating === "Unknown" ? "OUTSIDE_REFERENCE_INTERVALS" : "COMPATIBLE_REFERENCE";
  const ph = { explanationCode: phCode, value: phValue, rating: phRating, method: input.phMethod ?? "UNKNOWN", laboratoryVerified: !!input.laboratoryName?.trim(), guidance: phValue === null ? "pH is missing; soil reaction is unknown." : input.phMethod !== soilPhReference.method ? "Measured pH is retained. The method is missing or differs from the soil:water 1:2.5 reference, so no interpretation is assigned." : phRating === "Unknown" ? "This value lies outside the published intervals." : `Measured pH is ${phValue}; ${matchingBand(phValue, soilPhReference.bands)?.label} by the compatible soil:water 1:2.5 reference. Laboratory identity ${input.laboratoryName?.trim() ? "provided" : "not provided"}; this is tracked separately from the measurement.`, ...(phRating === "Unknown" ? {} : { sourceUrl: soilPhReference.url, reference: soilPhReference }) };
  const cropAdvice = savedCropSoilAdvice({ crop: input.crop, soil: input.soilType, state: input.state, district: input.district, ph: phValue, texture: null });
  const regionalDoses = matchScientificDoses(input.crop, input.state, input.district, input.season, { includeConfirmationOptions: true }).map(record => { const source = doseSources.find(item => item.id === record.sourceId) ?? null; return { id: record.id, crop: input.crop, state: record.state, district: record.district, season: record.season, nutrientsKgHa: record.nutrientsKgHa, scope: record.doseScope ?? record.conditions, source, document: source?.title ?? null, publicationDate: source?.publicationDate ?? "Not stated in source", sourceReviewedOn: source && "reviewedOn" in source ? source.reviewedOn ?? null : null, sourcePage: record.sourcePage, sourceRow: record.sourceRow, verificationStatus: record.verificationStatus, datasetVersion: record.datasetVersion }; });
  return {
    version: "smart-soil-v2", analysisVersion: "soil-basis-v5", mode: demo ? "DEMO" as const : "REAL" as const, synthetic: demo, dataLabel: demo ? "DEMO DATA" : "REAL LABORATORY MODE", demoFixtureId: demo ? input.demoFixtureId ?? null : null, laboratoryConfirmed: confirmed, location: `${input.district}, ${input.state}`, crop: input.crop, growthStage: input.growthStage, soilType: input.soilType,
    validationDiagnostics: [
      ...nutrientDiagnostics(input, [n, p, k, oc]),
      soilParameterDiagnostic(input, "Soil pH", { ...ph, method: input.phMethod ?? "UNKNOWN", basis: "soil reaction", unit: "pH" }),
    ],
    fertilizerAssessment: assessSoilFertilizer(input, [n, p, k]),
    nutrients: [n, p, k], ph, organicCarbon: oc, regionalRecommendations: regionalDoses,
    soilTestMetadata: {
      referenceId: standard?.id ?? null,
      referenceName: standard?.name ?? null,
      referenceSource: standard?.source ?? null,
      referenceUrl: standard?.url ?? null,
      labIdentity: input.laboratoryName?.trim() ? "provided" : "missing",
      labApplicability: confirmed ? "confirmed" : "not confirmed",
      missing: [
        ...[n, p, k].flatMap(row => [row.unit === "UNKNOWN" ? `${row.name}: unit` : null, row.method === "Unknown" ? `${row.name}: method` : null, row.name.includes("phosphorus") && row.basis === "UNKNOWN" ? "Available phosphorus: reporting basis" : null, row.name.includes("potassium") && row.basis === "UNKNOWN" ? "Available potassium: reporting basis" : null].filter((item): item is string => !!item)),
        phValue !== null && input.phMethod === "UNKNOWN" ? "Soil pH: method" : null,
      ].filter((item): item is string => !!item),
    },
    score: { value: null, label: "Insufficient data", explanation: "No validated regional composite scoring model with indicator weights, crop calibration and required laboratory inputs is configured. A numeric health score would be unsupported, even when all five readings are present." },
    recommendations: [ { title: `${input.crop}: soil suitability`, detail: cropAdvice.summary, sourceUrl: cropAdvice.sources[0]?.url }, { title: "Drainage and structure", detail: cropAdvice.drainage, sourceUrl: cropAdvice.sources[0]?.url }, { title: "Crop pH context", detail: `${cropAdvice.phRange ? `Published crop optimum: ${cropAdvice.phRange.join("–")}. This cannot be directly compared with the sample until laboratory method equivalence is established.` : "No source-backed crop-specific pH optimum is bundled. Ask the laboratory to interpret pH for the selected crop."} Reference scope: ${cropAdvice.scope}`, sourceUrl: cropAdvice.sources[0]?.url }, { title: "Organic carbon management", detail: oc.rating === "Low" ? `For ${input.crop}, discuss crop residues, suitable rotations and tested mature compost with the local KVK. Choose inputs from the crop-specific advisory and material analysis, not this OC percentage alone.` : `For ${input.crop}, review the measured OC status with the laboratory before planning organic inputs. No amendment amount is inferred from an unknown or unvalidated OC result.`, sourceUrl: standard?.url }, { title: "Nutrient planning", detail: "Use the crop-specific Soil Health Card or validated ICAR recommendation. Never subtract soil N/P/K readings from fertilizer targets; elemental P/K and P₂O₅/K₂O are different nutrient bases." } ],
    reference: demo && standard ? { ...standard, name: `DEMO DATA — ${standard.id}`, methodRequirement: "Synthetic fixture evaluation only. No issuing laboratory or applicability attestation exists for this sample." } : standard ?? null,
    note: demo ? "DEMO DATA: all readings and results are synthetic software-test examples. No laboratory attestation, field diagnosis, fertilizer prescription or numeric health score is provided. Method, reference, unit, basis and Olsen soil-condition restrictions still apply." : "Soil screening is separate from fertilizer planning. Missing inputs remain unknown. Classes use verified thresholds only when the selected regional reference, method, unit and reporting basis match. Laboratory identity is recorded for audit and is not required to assign a compatible class. Classes do not adjust fertilizer rates.",
    source: legacyReference.meta,
  };
}
