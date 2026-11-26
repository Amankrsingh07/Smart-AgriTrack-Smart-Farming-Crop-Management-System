import { nutrientContribution, type Nutrients } from "./smart-fertilizer";
import {
  phosphorusGrades,
  type PhosphorusGrade,
  verifiedFertilizerProducts,
} from "./fertilizer-product-grades";

export function calculateProductQuantities(
  target: Nutrients,
  source: PhosphorusGrade,
) {
  if (
    Object.values(target).some(
      (value) => !Number.isFinite(value) || value < 0 || value > 100_000,
    )
  )
    return null;
  const grade = phosphorusGrades[source];
  if (!grade) return null;
  const { Urea, MOP } = verifiedFertilizerProducts;
  const requested = target.p2o5 / grade.p2o5;
  const phosphorusProductKg = Math.min(
    requested,
    grade.n ? target.n / grade.n : Infinity,
    grade.k2o ? target.k2o / grade.k2o : Infinity,
  );
  const supplied = nutrientContribution(phosphorusProductKg, grade);
  const ureaKg = Math.max(0, target.n - supplied.n) / Urea.n;
  const mopKg = Math.max(0, target.k2o - supplied.k2o) / MOP.k2o;
  return {
    products: { Urea: ureaKg, [source]: phosphorusProductKg, MOP: mopKg },
    phosphorusGapKg: Math.max(0, target.p2o5 - supplied.p2o5),
    sulphurKg: phosphorusProductKg * grade.s,
    supplied: {
      n: supplied.n + ureaKg * Urea.n,
      p2o5: supplied.p2o5,
      k2o: supplied.k2o + mopKg * MOP.k2o,
    },
  };
}

export function theoreticalFertilizerBlend(
  weightKg: number,
  percentages: Nutrients,
  source: PhosphorusGrade = "DAP",
) {
  const { n, p2o5, k2o } = percentages;
  if (
    !Number.isFinite(weightKg) ||
    weightKg < 0.001 ||
    weightKg > 100_000 ||
    Object.values(percentages).some(
      (value) => !Number.isFinite(value) || value < 0 || value > 100,
    ) ||
    n + p2o5 + k2o > 100
  ) {
    return { status: "invalid" } as const;
  }

  const target = {
    n: (weightKg * n) / 100,
    p2o5: (weightKg * p2o5) / 100,
    k2o: (weightKg * k2o) / 100,
  };
  const result = calculateProductQuantities(target, source);
  if (!result) return { status: "invalid" } as const;
  if (result.phosphorusGapKg > 1e-8) {
    return {
      status: source === "DAP" ? "excess-nitrogen" : "nutrient-gap",
    } as const;
  }
  const total = Object.values(result.products).reduce((sum, kg) => sum + kg, 0);
  if (total > weightKg + 1e-8) return { status: "excess-weight" } as const;
  return {
    status: "calculated",
    products: result.products,
    fillerKg: Math.max(0, weightKg - total),
    composition: {
      n: (result.supplied.n / weightKg) * 100,
      p2o5: (result.supplied.p2o5 / weightKg) * 100,
      k2o: (result.supplied.k2o / weightKg) * 100,
    },
    sulphurPercent: (result.sulphurKg / weightKg) * 100,
  } as const;
}
