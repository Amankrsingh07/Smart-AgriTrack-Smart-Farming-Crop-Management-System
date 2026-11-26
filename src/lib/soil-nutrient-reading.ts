import type { SoilHealthInput } from "./soil-health";

export const soilNutrients = ["nitrogen", "phosphorus", "potassium"] as const;
export type SoilNutrient = (typeof soilNutrients)[number];

export function soilNutrientReading(
  input: Partial<SoilHealthInput>,
  nutrient: SoilNutrient,
) {
  const value = input[`${nutrient}Value`];
  const unit = input[`${nutrient}Unit`];
  // Legacy mass fields shared a unit, and older saves populated unused
  // per-nutrient selectors with UNKNOWN. Modern explicit UNKNOWN stays unknown.
  const legacyValue = input[`${nutrient}KgHa`];
  return {
    value: value ?? legacyValue,
    unit:
      unit === undefined ||
      (value == null && legacyValue != null && unit === "UNKNOWN")
        ? (input.nutrientUnit ?? "UNKNOWN")
        : unit,
  };
}
