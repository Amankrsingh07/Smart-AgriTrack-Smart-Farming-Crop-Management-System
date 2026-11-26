import { soilNutrientReading } from "./soil-nutrient-reading";
import { isDemoSoilSample, type SoilProvenance } from "./soil-sample-mode";
import {
  canonicalSoilMethod,
  canonicalSoilPhMethod,
} from "./soil-reference-matching";
import type { SoilHealthInput } from "./soil-health";
export const soilTrendMetrics = [
  "nitrogenKgHa",
  "phosphorusKgHa",
  "potassiumKgHa",
  "organicCarbonPercent",
  "soilPh",
] as const;
export type SoilTrendMetric = (typeof soilTrendMetrics)[number];
type RecordInput = {
  id: string;
  createdAt: string;
  input: SoilHealthInput;
  result?: { version?: string } & SoilProvenance;
};
export type TrendPoint = { id: string; date: string; value: number };
export type SoilTrendGroup = {
  key: string;
  label: string;
  unit: string;
  points: TrendPoint[];
};
const methods = {
  nitrogenKgHa: "nitrogenMethod",
  phosphorusKgHa: "phosphorusMethod",
  potassiumKgHa: "potassiumMethod",
  organicCarbonPercent: "organicCarbonMethod",
  soilPh: "phMethod",
} as const;
const nutrientForMetric = {
  nitrogenKgHa: "nitrogen",
  phosphorusKgHa: "phosphorus",
  potassiumKgHa: "potassium",
} as const;
function readingValue(input: SoilHealthInput, metric: SoilTrendMetric) {
  return metric === "organicCarbonPercent" || metric === "soilPh"
    ? input[metric]
    : soilNutrientReading(input, nutrientForMetric[metric]).value;
}
function metadata(input: SoilHealthInput, metric: SoilTrendMetric) {
  return {
    method:
      metric === "soilPh"
        ? (canonicalSoilPhMethod(input.phMethod) ?? undefined)
        : input?.[methods[metric]]?.trim(),
    basis:
      metric === "phosphorusKgHa"
        ? input?.phosphorusBasis
        : metric === "potassiumKgHa"
          ? input?.potassiumBasis
          : metric === "nitrogenKgHa"
            ? "N"
            : metric === "organicCarbonPercent"
              ? "OC"
              : "pH",
    unit:
      metric === "soilPh"
        ? "pH"
        : metric === "organicCarbonPercent"
          ? "%"
          : soilNutrientReading(input, nutrientForMetric[metric]).unit,
  };
}
export function soilTrendExclusionReasons(
  record: RecordInput,
  fieldId: string,
  metric: SoilTrendMetric,
): string[] {
  const input = record.input;
  if (isDemoSoilSample(input, record.result))
    return ["DEMO DATA is excluded from real laboratory trends."];
  if (record.result?.version !== "smart-soil-v2")
    return [
      "Legacy report: comparable laboratory metadata is not established.",
    ];
  if (!input?.fieldId) return ["No saved field is linked to this sample."];
  if (input.fieldId !== fieldId)
    return ["This sample belongs to a different field."];
  const reasons: string[] = [];
  const { method, basis, unit } = metadata(input, metric);
  const date = input.sampleDate
    ? new Date(`${input.sampleDate}T00:00:00Z`)
    : null;
  if (
    !date ||
    !Number.isFinite(date.getTime()) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.sampleDate!) ||
    date.toISOString().slice(0, 10) !== input.sampleDate
  )
    reasons.push(
      "A valid laboratory sample date is missing; the submission date cannot replace it.",
    );
  if (
    !Number.isFinite(input.samplingDepthCm) ||
    (input.samplingDepthCm ?? 0) <= 0
  )
    reasons.push("A positive measured sampling depth is missing.");
  if (!input.laboratoryName?.trim())
    reasons.push("Issuing laboratory name is missing.");
  if (
    !method ||
    method.toUpperCase() === "UNKNOWN" ||
    (metric === "soilPh" && method.toUpperCase() === "OTHER")
  )
    reasons.push(
      "The laboratory test method for this parameter is missing or unspecified.",
    );
  if (!basis || basis === "UNKNOWN")
    reasons.push("The original nutrient reporting basis is missing.");
  if (!unit || unit === "UNKNOWN")
    reasons.push("The original measurement unit is missing.");
  const value = readingValue(input, metric);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    reasons.push("This parameter has no valid measured reading.");
  return reasons;
}
/** Compare original readings only. Method aliases resolve only through the reviewed alias registry. */
export function soilTrendGroups(
  records: RecordInput[],
  fieldId: string,
  metric: SoilTrendMetric,
): SoilTrendGroup[] {
  if (!fieldId) return [];
  const groups = new Map<string, SoilTrendGroup>();
  for (const record of records) {
    if (soilTrendExclusionReasons(record, fieldId, metric).length) continue;
    const input = record.input;
    const { method, basis, unit } = metadata(input, metric);
    const methodKey = canonicalSoilMethod(method) ?? method!.toLowerCase();
    const key = JSON.stringify([
      fieldId,
      input.laboratoryName!.trim().toLowerCase(),
      methodKey,
      input.samplingDepthCm,
      basis,
      unit,
    ]);
    const group = groups.get(key) ?? {
      key,
      label: `${input.laboratoryName} · ${method} · ${input.samplingDepthCm} cm · ${basis} · ${unit}`,
      unit: unit!,
      points: [],
    };
    group.points.push({
      id: record.id,
      date: input.sampleDate!,
      value: readingValue(input, metric)!,
    });
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    points: group.points.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    ),
  }));
}
export function preferredSoilTrendGroup(
  groups: SoilTrendGroup[],
  requestedKey: string,
) {
  return (
    groups.find((group) => group.key === requestedKey) ??
    groups.find(
      (group) => new Set(group.points.map((p) => p.date)).size >= 2,
    ) ??
    groups[0]
  );
}
