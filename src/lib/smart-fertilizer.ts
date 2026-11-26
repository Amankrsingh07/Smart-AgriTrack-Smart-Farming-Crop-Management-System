import { z } from "zod";
import type { SoilHealthInput } from "./soil-health";
import { isDemoSoilSample } from "./soil-sample-mode";

export const nutrientSchema = z.object({
  n: z.number().finite().min(0).max(100000),
  p2o5: z.number().finite().min(0).max(100000),
  k2o: z.number().finite().min(0).max(100000),
});
export type Nutrients = z.infer<typeof nutrientSchema>;
export const compositionSchema = z
  .object({
    n: z.number().finite().min(0).max(1),
    p2o5: z.number().finite().min(0).max(1),
    k2o: z.number().finite().min(0).max(1),
  })
  .refine(
    (v) => v.n + v.p2o5 + v.k2o <= 1,
    "Nutrient fractions exceed product mass.",
  );
export const grades = {
  Urea: { n: 0.46, p2o5: 0, k2o: 0 },
  DAP: { n: 0.18, p2o5: 0.46, k2o: 0 },
  MOP: { n: 0, p2o5: 0, k2o: 0.6 },
};
export const zero = (): Nutrients => ({ n: 0, p2o5: 0, k2o: 0 });
export const insufficient =
  "Insufficient Data – Validated soil test information is required.";
export const imageUndetermined =
  "Unable to determine – Further field inspection or laboratory testing is recommended.";
export function fieldHectares(area: number, unit: string) {
  const factors: Record<string, number> = {
    hectare: 1,
    ha: 1,
    acre: 0.40468564224,
  };
  const result = area * factors[unit.toLowerCase()];
  if (!Number.isFinite(result) || result <= 0)
    throw new Error("Field area or area unit is invalid.");
  return result;
}
export type ApplicationNutrients = {
  quantityKg: number;
  composition: Nutrients;
  status: string;
};
export function nutrientContribution(
  quantityKg: number,
  composition: Nutrients,
): Nutrients {
  z.number().finite().nonnegative().parse(quantityKg);
  compositionSchema.parse(composition);
  return {
    n: quantityKg * composition.n,
    p2o5: quantityKg * composition.p2o5,
    k2o: quantityKg * composition.k2o,
  };
}
export function appliedNutrients(applications: ApplicationNutrients[]) {
  return applications
    .filter((a) => a.status === "APPLIED")
    .reduce((total, a) => {
      const v = nutrientContribution(a.quantityKg, a.composition);
      return {
        n: total.n + v.n,
        p2o5: total.p2o5 + v.p2o5,
        k2o: total.k2o + v.k2o,
      };
    }, zero());
}
export function productsFor(target: Nutrients) {
  nutrientSchema.parse(target);
  const DAP = target.p2o5 / grades.DAP.p2o5;
  if (DAP * grades.DAP.n > target.n + 1e-8)
    throw new Error(
      "DAP would exceed the remaining N target. Ask an adviser to select a different phosphorus source.",
    );
  return {
    Urea: Math.max(0, target.n - DAP * grades.DAP.n) / grades.Urea.n,
    DAP,
    MOP: target.k2o / grades.MOP.k2o,
  };
}
export function calculateNutrients(
  rates: Nutrients,
  areaHa: number,
  applications: ApplicationNutrients[],
  limits?: Nutrients,
) {
  nutrientSchema.parse(rates);
  z.number().finite().positive().parse(areaHa);
  if (
    limits &&
    (Object.keys(rates) as Array<keyof Nutrients>).some(
      (k) => rates[k] > limits[k],
    )
  )
    throw new Error("Dose exceeds the documented applicable limit.");
  const total = {
    n: rates.n * areaHa,
    p2o5: rates.p2o5 * areaHa,
    k2o: rates.k2o * areaHa,
  };
  const applied = appliedNutrients(applications);
  const remaining = {
    n: Math.max(0, total.n - applied.n),
    p2o5: Math.max(0, total.p2o5 - applied.p2o5),
    k2o: Math.max(0, total.k2o - applied.k2o),
  };
  return {
    total,
    applied,
    remaining,
    products: productsFor(remaining),
    warnings: (Object.keys(total) as Array<keyof Nutrients>)
      .filter((k) => applied[k] > total[k] + 1e-8)
      .map(
        (k) =>
          `Already applied ${k} exceeds the documented total. Review with KVK.`,
      ),
    method:
      "Field total = rate × hectares. Deduct APPLIED nutrient contributions once. DAP = remaining P₂O₅ / 0.46; Urea = (remaining N − DAP × 0.18) / 0.46; MOP = remaining K₂O / 0.60. Product grades must match actual labels.",
  };
}
export function soilModelReadiness(input?: Partial<SoilHealthInput> | null) {
  const missing: string[] = [];
  if (!input || isDemoSoilSample(input))
    return {
      enabled: false,
      missing: [
        insufficient,
        "A real laboratory report is required.",
        "No validated regional STCR model is configured.",
      ],
    };
  for (const k of ["nitrogenKgHa", "phosphorusKgHa", "potassiumKgHa"] as const)
    if (typeof input[k] !== "number" || !Number.isFinite(input[k]))
      missing.push(`Missing ${k}`);
  if (!input.nutrientUnit || input.nutrientUnit === "UNKNOWN")
    missing.push("Unknown nutrient measurement units");
  if (!input.phosphorusBasis || input.phosphorusBasis === "UNKNOWN")
    missing.push("Unknown phosphorus basis");
  if (!input.potassiumBasis || input.potassiumBasis === "UNKNOWN")
    missing.push("Unknown potassium basis");
  for (const k of [
    "nitrogenMethod",
    "phosphorusMethod",
    "potassiumMethod",
    "laboratoryName",
    "reportNumber",
    "sampleDate",
    "samplingDepthCm",
  ] as const)
    if (!input[k]) missing.push(`Missing ${k}`);
  missing.push(
    "No validated regional STCR model is configured: calibration, compatible units/bases, test methods, coefficients, target-yield range and limits are required. No mg/kg-to-kg/ha conversion is performed. Documented chemical-basis conversions can support interpretation, but cannot supply a missing crop-response model.",
  );
  return { enabled: false, missing };
}
export function estimateCost(
  quantityKg: number,
  price: number,
  bagKg: number,
  areaHa: number,
) {
  for (const value of [quantityKg, price])
    z.number().finite().nonnegative().parse(value);
  for (const value of [bagKg, areaHa])
    z.number().finite().positive().parse(value);
  const unitPrice = price / bagKg,
    total = quantityKg * unitPrice;
  return {
    unitPrice,
    total,
    perHa: total / areaHa,
    currency: "INR",
    source: "Farmer-entered local price; estimate only",
  };
}
export function canSchedule(cycle: {
  status: string;
  actualHarvestDate: unknown;
  sowingDate: unknown;
}) {
  return (
    ["PLANNED", "ACTIVE"].includes(cycle.status) &&
    !cycle.actualHarvestDate &&
    !!cycle.sowingDate
  );
}
