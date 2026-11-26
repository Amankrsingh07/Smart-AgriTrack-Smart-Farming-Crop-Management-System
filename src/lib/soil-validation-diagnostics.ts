import type { SoilHealthInput, SoilRating } from "./soil-health";
export type SoilDiagnosticCategory =
  | "CLASSIFIED"
  | "FARMER_INPUT"
  | "LABORATORY_CONFIRMATION"
  | "REFERENCE_DATASET"
  | "REFERENCE_APPLICABILITY";
export function soilParameterDiagnostic(
  input: SoilHealthInput,
  parameter: string,
  row: {
    value: number | null;
    rating: string;
    explanationCode?: string;
    guidance: string;
    applicabilityExplanation?: string;
    method?: string;
    basis?: string;
    unit?: string;
  },
) {
  const code = row.explanationCode ?? "UNVERIFIED_INTERPRETATION";
  let category: SoilDiagnosticCategory = "REFERENCE_DATASET";
  let action =
    "Ask the issuing laboratory or local KVK for a documented compatible interpretation reference. Keep the original reading unchanged.";
  if (code === "COMPATIBLE_REFERENCE" && row.rating !== "Unknown") {
    category = "CLASSIFIED";
    action =
      "This indicator is independently reference-compatible. Its class does not establish a fertilizer dose or a locally calibrated crop response.";
  } else if (code === "UNCONFIRMED_APPLICABILITY") {
    category = "LABORATORY_CONFIRMATION";
    action =
      "Ask the issuing laboratory whether this reference and analytical method apply to the sample. Record confirmation only after it is actually obtained; do not tick the checkbox merely to unlock results.";
  } else if (
    [
      "MISSING_READING",
      "INVALID_READING",
      "MISSING_LAB_IDENTITY",
      "UNKNOWN_NUTRIENT_BASIS",
      "UNKNOWN_UNIT",
    ].includes(code) ||
    (code === "UNSUPPORTED_METHOD" &&
      (!row.method || ["UNKNOWN", "OTHER"].includes(row.method.toUpperCase())))
  ) {
    category = "FARMER_INPUT";
    action =
      "Complete only the actual measured reading and metadata from the laboratory report. Missing information must not be guessed.";
  } else if (code === "REFERENCE_REGION_MISMATCH") {
    category = "FARMER_INPUT";
    action =
      "Select the documented reference applicable to the report's state, then obtain the issuing laboratory's applicability confirmation. Selecting a hosted reference does not prove local calibration.";
  } else if (code === "OLSEN_SOIL_CONDITION") {
    category = "REFERENCE_APPLICABILITY";
    action = `The recorded pH is ${input.soilPh ?? "missing"}; the configured Olsen screening rule requires alkaline water pH above 7. Obtain a reference applicable to this recorded method and soil, or ask the lab whether another test is needed. Do not change the pH, relabel Olsen as Bray, or borrow another region's thresholds.`;
  } else if (
    code === "UNSUPPORTED_METHOD" ||
    code === "REFERENCE_METHOD_MISMATCH"
  ) {
    action = `Keep the recorded method ${row.method || "as stated by the lab"}. A compatible reference for this assay in this region is required; a different extractant cannot be substituted.`;
  }
  return {
    parameter,
    status: row.rating,
    classified: category === "CLASSIFIED",
    code,
    category,
    detail: row.applicabilityExplanation ?? row.guidance,
    action,
    recorded: {
      value: row.value,
      method: row.method ?? null,
      basis: row.basis ?? null,
      unit: row.unit ?? null,
    },
  };
}
export function nutrientDiagnostics(
  input: SoilHealthInput,
  rows: SoilRating[],
) {
  return rows.map((row) => soilParameterDiagnostic(input, row.name, row));
}
