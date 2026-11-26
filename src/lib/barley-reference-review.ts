import dataset from "@/data/barley-reference-review.json";
/** Reviewed evidence only. Rejected/incomplete references never supply rates or coefficients. */
export function barleyReferenceReview(crop: string, state: string) {
  const normalize = (value: string) => value.trim().toLowerCase();
  if (
    normalize(state) !== normalize(dataset.state) ||
    !dataset.cropAliases.some((alias) => normalize(alias) === normalize(crop))
  )
    return null;
  return { ...dataset, numericalRecommendation: null, actionableSchedule: [] };
}
