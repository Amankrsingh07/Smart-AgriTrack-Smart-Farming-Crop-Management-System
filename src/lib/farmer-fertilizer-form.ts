import type { SoilHealthInput } from "./soil-health";
import { fieldHectares } from "./smart-fertilizer";

type ReadingKey = "nitrogenValue" | "phosphorusValue" | "potassiumValue" | "soilPh";
export type FarmerSoilForm = Omit<SoilHealthInput, ReadingKey> & Record<ReadingKey, string>;

export function fertilizerAreaHa(value: string, unit: "acre" | "hectare") {
  const area = Number(value);
  return Number.isFinite(area) && area > 0 && area <= 100_000 ? fieldHectares(area, unit) : null;
}

export function farmerSoilPayload(values: FarmerSoilForm, areaHa: number): SoilHealthInput {
  const { nitrogenValue, phosphorusValue, potassiumValue, soilPh, ...context } = values;
  const reading = (value: string) => value.trim() === "" ? undefined : Number(value);
  return {
    ...context, soilType: context.soilType || "Unknown", fieldAreaHa: areaHa,
    nitrogenValue: reading(nitrogenValue), phosphorusValue: reading(phosphorusValue),
    potassiumValue: reading(potassiumValue), soilPh: reading(soilPh),
  };
}
