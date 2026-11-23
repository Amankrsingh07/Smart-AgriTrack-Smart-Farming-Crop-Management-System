import { Prisma } from "@prisma/client";
import { compositionSchema, nutrientSchema } from "./smart-fertilizer";

type Applied = { status: string; quantityKg: string; composition: unknown; planId: string | null };

export function assessRecordedNutritionPlan(plan: { id: string; result: unknown } | null, records: Applied[]) {
  const target = nutrientSchema.safeParse((plan?.result as { total?: unknown } | null)?.total);
  const applied = records.filter(row => row.status === "APPLIED");
  if (!plan || !target.success || !applied.length || applied.some(row => row.planId !== plan.id)) return null;
  const totals = { n: new Prisma.Decimal(0), p2o5: new Prisma.Decimal(0), k2o: new Prisma.Decimal(0) };
  for (const row of applied) {
    const grade = compositionSchema.safeParse(row.composition);
    const quantity = Number(row.quantityKg);
    if (!grade.success || !Number.isFinite(quantity) || quantity < 0) return null;
    for (const key of ["n", "p2o5", "k2o"] as const) totals[key] = totals[key].plus(new Prisma.Decimal(row.quantityKg).times(grade.data[key]));
  }
  return (["n", "p2o5", "k2o"] as const).map(key => {
    const targetKg = new Prisma.Decimal(target.data[key]);
    const balance = targetKg.minus(totals[key]);
    return { nutrient: key, targetKg: targetKg.toString(), recordedKg: totals[key].toString(), balanceKg: balance.toString(), exceeds: balance.lt(-.001) };
  });
}
