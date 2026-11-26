import { findIndianState, findIndianDistrict } from "./india-location";
import type { SoilHealthInput } from "./soil-health";

type OwnedContext = {
  farm?: { id: string; state: string; district: string } | null;
  field?: {
    id: string;
    farmId: string;
    soilType: string;
    farm: { state: string; district: string };
  } | null;
  cycle?: {
    id: string;
    fieldId: string;
    cropId: string;
    crop: { name: string };
  } | null;
  crop?: { id: string; name: string } | null;
};
const locationText = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
/** Known aliases resolve within the same state; unknown names retain their characters. */
export function soilLocationsMatch(
  a: { state: string; district: string },
  b: { state: string; district: string },
) {
  const stateA = findIndianState(a.state),
    stateB = findIndianState(b.state);
  if (
    stateA && stateB
      ? stateA.code !== stateB.code
      : locationText(a.state) !== locationText(b.state)
  )
    return false;
  const districtA = stateA
    ? findIndianDistrict(stateA.code, a.district)
    : undefined;
  const districtB = stateB
    ? findIndianDistrict(stateB.code, b.district)
    : undefined;
  return districtA && districtB
    ? districtA.code === districtB.code
    : locationText(a.district) === locationText(b.district);
}

/** Called only with account-scoped farm, field and cycle lookups. IDs never inferred from crop labels. */
export function soilLinkError(
  input: SoilHealthInput,
  context: OwnedContext,
): string | null {
  if (
    (input.farmId && !context.farm) ||
    (input.fieldId && !context.field) ||
    (input.cropCycleId && !context.cycle) ||
    (input.cropId && !context.crop)
  )
    return "Linked farm, field, crop or cycle was not found in your account.";
  if (context.field && input.farmId && context.field.farmId !== input.farmId)
    return "The selected field does not belong to the selected farm.";
  if (
    context.cycle &&
    (!input.fieldId ||
      context.cycle.fieldId !== input.fieldId ||
      context.cycle.cropId !== input.cropId)
  )
    return "Crop cycle, field and crop must refer to the same saved records.";
  if (context.crop && context.crop.name !== input.crop)
    return "The crop name must match the selected crop ID.";
  const location = context.field?.farm ?? context.farm;
  if (location && !soilLocationsMatch(location, input))
    return "Soil sample location must match its saved farm.";
  if (context.field && context.field.soilType !== input.soilType)
    return "Soil type must match the saved field. Update the field first if needed.";
  return null;
}
