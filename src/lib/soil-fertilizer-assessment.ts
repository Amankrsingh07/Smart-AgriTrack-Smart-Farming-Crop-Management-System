import type { SoilHealthInput, SoilRating } from "./soil-health";
import { isDemoSoilSample } from "./soil-sample-mode";
import { getIcarRecipes, getIcarReferenceReviews } from "./icar-fertilizer";
import { barleyProductionReview } from "./barley-production";
import { barleyReferenceReview } from "./barley-reference-review";

export const biharWheatDoseReference = {
  id: "ICAR-BIHAR-WHEAT-RABI-2021-22",
  organization: "ICAR",
  year: 2021,
  season: "RABI",
  state: "Bihar",
  crop: "Wheat",
  title: "Rabi Agro-Advisory for Farmers 2021–22",
  documentReference: "Zone IV, Bihar, Wheat, printed pp.172–173",
  url: "https://www.icar.gov.in/sites/default/files/2022-09/Rabi-Agro-Advisory-2021-22_0.pdf",
  validationStatus: "PUBLICATION_VERIFIED",
  units: "kg/ha N:P2O5:K2O",
  // A published range is not permission to select a rate for a particular field.
  publishedNormalSownRange: { n: [120, 150], p2o5: [60, 60], k2o: [40, 40] },
  limitations:
    "Standard advisory only. Normal-sown, late-sown and rain-fed packages differ. This source does not supply a Bihar Wheat soil-class-to-dose adjustment rule. Confirm current applicability with KVK.",
};
export function assessSoilFertilizer(
  input: SoilHealthInput,
  nutrients: SoilRating[],
) {
  const wheatRecipe = getIcarRecipes(
    input.crop,
    input.state,
    input.district,
  ).find((r) => r.id === "wheat-bihar-rabi");
  const reference = wheatRecipe ? biharWheatDoseReference : null;
  const referenceReviews = getIcarReferenceReviews(input.crop, input.state);
  const productionReview = barleyProductionReview(input);
  const scientificReview = barleyReferenceReview(input.crop, input.state);
  const missingRequirements: Array<{ code: string; detail: string }> = [];
  if (isDemoSoilSample(input))
    missingRequirements.push({
      code: "DEMONSTRATION_DATA",
      detail: "Demonstration readings cannot authorize a field recommendation.",
    });
  if (!Number.isFinite(input.fieldAreaHa) || (input.fieldAreaHa ?? 0) <= 0)
    missingRequirements.push({
      code: "MISSING_FIELD_AREA",
      detail:
        "Record a positive field area and its units; no default area is substituted.",
    });
  for (const row of nutrients)
    if (
      row.rating === "Unknown" ||
      row.explanationCode !== "COMPATIBLE_REFERENCE"
    )
      missingRequirements.push({
        code: row.explanationCode ?? "UNVERIFIED_CLASSIFICATION",
        detail: `${row.name}: ${row.guidance}`,
      });
  if (!reference)
    missingRequirements.push({
      code: "NO_VERIFIED_CROP_DOSE_REFERENCE",
      detail: scientificReview
        ? `No calculation-ready ${input.state} ${input.crop} dose is configured. A Bihar-inclusive standard advisory was found, but its nutrient bases and applicable production package remain unresolved; see the cited scientific review. References from other crops or regions are not substituted.`
        : `No reviewed crop-dose reference is configured for ${input.crop} in ${input.state}. References from other crops or regions are not substituted.`,
    });
  if (productionReview?.missingInputs.length)
    missingRequirements.push({
      code: "MISSING_BARLEY_PRODUCTION_CONDITIONS",
      detail: `Complete actual production details: ${productionReview.missingInputs.join("; ")}. This does not resolve missing scientific nutrient bases.`,
    });
  for (const review of referenceReviews)
    missingRequirements.push({
      code: "CROP_REFERENCE_WITHHELD",
      detail: `${review.documentReference}: ${review.issues?.join(" ")} ${review.action}`,
    });
  for (const review of scientificReview?.reviews ?? []) {
    if (
      review.code === "NO_COMPATIBLE_NONALKALINE_OLSEN_REFERENCE" &&
      !nutrients.some((row) => row.explanationCode === "OLSEN_SOIL_CONDITION")
    )
      continue;
    missingRequirements.push({
      code: review.code,
      detail: `${review.missingRequirement} ${review.action} Source: ${review.organization}, ${review.documentReference}. ${review.url} Review dataset ${scientificReview!.version}.`,
    });
  }
  missingRequirements.push({
    code: "NO_VALIDATED_REGIONAL_ADJUSTMENT_RULE",
    detail: `No validated ${input.state} ${input.crop} soil-test-to-fertilizer adjustment rule is configured. Required: a published regional class-to-dose table or calibrated model, matching extraction methods and nutrient bases, soil/crop/season scope, applicable limits, and its required crop-management inputs. Indicative Low/Medium/High classes do not supply these rules.`,
  });
  return {
    status: "UNVERIFIED" as const,
    method: "Soil-test-adjusted recommendation gate",
    numericalRecommendation: null,
    fieldAreaHa: input.fieldAreaHa ?? null,
    referenceReviews,
    scientificReview,
    productionReview,
    reference,
    standardCalculatorRecipeId: wheatRecipe?.id ?? null,
    classificationSummary: nutrients.map((row) => ({
      parameter: row.name,
      rating: row.rating,
      explanationCode: row.explanationCode,
      referenceId: row.reference?.id ?? null,
    })),
    missingRequirements,
    suggestions: [
      {
        name: "Urea",
        nutrientSupplied: "N",
        reason:
          "Potential nitrogen source; any DAP nitrogen and previous applications must be deducted before calculating additional Urea.",
      },
      {
        name: "DAP",
        nutrientSupplied: "N and P2O5",
        reason:
          "Potential phosphorus source that also supplies nitrogen. A Medium soil class is not a dose prescription.",
      },
      {
        name: "MOP",
        nutrientSupplied: "K2O",
        reason:
          "Potential potassium source. A Low soil class requires an applicable crop-response rule before selecting quantity.",
      },
    ].map((product) => ({
      ...product,
      validationStatus: "NOT_A_PRESCRIPTION",
      quantityPerAcreKg: null,
      totalQuantityKg: null,
      applicationSchedule: [],
    })),
    caution:
      "The separate offline standard calculator remains available. Its published or farmer-entered rates must not be presented as a soil-test-adjusted recommendation. No generic percentage increase, soil-nutrient subtraction or target yield is inferred.",
  };
}
