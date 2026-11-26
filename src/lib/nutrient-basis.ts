/** Published rounded chemical-basis factors; never converts extractants or concentration to area. */
export const nutrientBasisReference = {
  id: "GOI-2011-ANNEXURE-12",
  title:
    "Soil Testing in India (2011), Annexure 12, Plant Nutrient Conversion, printed p.190",
  url: "https://biharsoilhealth.in/documents/manualgoi.pdf#page=191",
  scope:
    "Chemical reporting basis only; no change of laboratory method, nutrient availability or soil mass",
};
const rules = {
  "P:P2O5": { factor: 2.29, resolution: 0.01 },
  "P2O5:P": { factor: 0.437, resolution: 0.001 },
  "K:K2O": { factor: 1.2, resolution: 0.01 },
  "K2O:K": { factor: 0.83, resolution: 0.001 },
} as const;
export function canConvertNutrientBasis(from: string, to: string) {
  return Object.hasOwn(rules, `${from}:${to}`);
}
export function convertNutrientBasis(value: number, from: string, to: string) {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(
      "A finite, nonnegative measured nutrient value is required.",
    );
  if (from === to && ["N", "P", "P2O5", "K", "K2O", "OC"].includes(from))
    return {
      originalValue: value,
      originalBasis: from,
      value,
      basis: to,
      factor: 1,
      minimum: value,
      maximum: value,
      converted: false,
      reference: null,
    };
  if (!canConvertNutrientBasis(from, to))
    throw new Error(`Unsupported nutrient basis conversion: ${from} to ${to}.`);
  const rule = rules[`${from}:${to}` as keyof typeof rules];
  const convertedValue = value * rule.factor;
  if (!Number.isFinite(convertedValue))
    throw new RangeError(
      "Converted nutrient value is outside the supported numeric range.",
    );
  return {
    originalValue: value,
    originalBasis: from,
    value: convertedValue,
    basis: to,
    factor: rule.factor,
    // Half the last published digit bounds factor rounding only, not measurement uncertainty.
    minimum: value * (rule.factor - rule.resolution / 2),
    maximum: value * (rule.factor + rule.resolution / 2),
    converted: true,
    reference: nutrientBasisReference,
  };
}
export type NutrientBasisConversion = ReturnType<typeof convertNutrientBasis>;
