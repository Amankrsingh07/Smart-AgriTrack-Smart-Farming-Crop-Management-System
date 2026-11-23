import { assessProtectionLabs } from "./crop-protection-labs";
import type { NutritionSample } from "./nutrition-evidence";

export const nutrientWaterSources = {
  sar: { title: "FAO Water Quality for Agriculture · Infiltration", url: "https://www.fao.org/4/t0234e/t0234e04.htm", edition: "1985, Irrigation and Drainage Paper 29 Rev. 1" },
  rsc: { title: "USDA Classification and Use of Irrigation Waters · Circular 969", url: "https://www.ars.usda.gov/arsuserfiles/20360500/pdf_pubs/P0192.pdf", edition: "Circular 969, p. 5" },
};

export function reviewNutritionWater(sample: NutritionSample) {
  if (sample.group !== "water") return null;
  const ion = (parameter: string) => sample.measurements.find(row => row.parameter === parameter &&
    row.unit === "meq/L" && row.basis === "Dissolved ion" && row.method?.trim() && !/^(unknown|unspecified|n\/a)$/i.test(row.method.trim()) && row.value >= 0)?.value;
  const sodium = ion("Sodium");
  const calcium = ion("Calcium");
  const magnesium = ion("Magnesium");
  const carbonate = ion("Carbonate");
  const bicarbonate = ion("Bicarbonate");
  const hardnessIons = calcium === undefined || magnesium === undefined ? null : calcium + magnesium;
  const sar = sodium === undefined || hardnessIons === null || hardnessIons <= 0 ? null : sodium / Math.sqrt(hardnessIons / 2);
  const rsc = hardnessIons === null || carbonate === undefined || bicarbonate === undefined ? null : carbonate + bicarbonate - hardnessIons;
  const screening = assessProtectionLabs(sample.measurements.filter(row => ["EC", "TDS", "SAR"].includes(row.parameter)).map(row => ({
    matrix: "Water", parameter: row.parameter, value: row.value, unit: row.unit, method: row.method ?? "", laboratory: sample.laboratory,
    sampleLocation: sample.sampleLocation, sampleDate: sample.sampleDate, reportReference: sample.reportNumber,
  })));
  const boron = sample.measurements.find(row => row.parameter === "Boron" && row.unit === "mg/L" && row.basis === "B" &&
    !!row.method?.trim() && !/^(unknown|unspecified|n\/a)$/i.test(row.method.trim()));
  const boronScreen = boron ? {
    status: boron.value < .7 ? "No restriction indicated by boron alone" : boron.value <= 3 ? "Slight to moderate potential boron restriction" : "Severe potential boron restriction",
    source: "https://www.fao.org/4/t0234e/T0234E01.htm",
    limitation: "FAO Water Quality for Agriculture, Table 1. General irrigation screening; crop sensitivity and local conditions determine applicability.",
  } : null;
  return { sar, rsc, screening, boronScreen, sources: nutrientWaterSources };
}

export function comparableNutritionMeasurements(first: NutritionSample, second: NutritionSample) {
  if (first.group !== second.group || first.sampleLocation !== second.sampleLocation || first.sampleDate === second.sampleDate ||
    (first.group === "water" ? !first.sourceOrPart || first.sourceOrPart !== second.sourceOrPart :
      first.group === "tissue" ? !first.variety || first.variety !== second.variety || first.stage !== second.stage || first.sourceOrPart !== second.sourceOrPart :
        !first.depth || first.depth !== second.depth)) return [];
  return first.measurements.flatMap(before => {
    const after = second.measurements.find(row => row.parameter === before.parameter && row.unit === before.unit &&
      !!before.method && row.method === before.method && !!before.basis && row.basis === before.basis && row.extractionMethod === before.extractionMethod);
    return after ? [{ parameter: before.parameter, unit: before.unit, points: [{ date: first.sampleDate, value: before.value }, { date: second.sampleDate, value: after.value }] }] : [];
  });
}
