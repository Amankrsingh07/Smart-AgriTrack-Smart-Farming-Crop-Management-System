import { Prisma } from "@prisma/client";
import { lossMetrics, type LossMetricInput } from "./crop-loss";

export type ReportLot = {
  crop: string; cropId: string; farmId: string; fieldId: string; unit: string; harvestDate: string;
  metrics: LossMetricInput | null;
};
export type LossReportFilters = { farmId?: string; fieldId?: string; cropId?: string; from?: string; to?: string; unit?: string };

/** Aggregates only confirmed allocations, with exact unit buckets and verified monetary values. */
export function aggregateLossReport(lots: ReportLot[], filters: LossReportFilters = {}) {
  const rows = lots.filter(row => (!filters.farmId || row.farmId === filters.farmId)
    && (!filters.fieldId || row.fieldId === filters.fieldId) && (!filters.cropId || row.cropId === filters.cropId)
    && (!filters.unit || row.unit === filters.unit) && (!filters.from || row.harvestDate >= filters.from)
    && (!filters.to || row.harvestDate <= filters.to) && row.metrics && lossMetrics(row.metrics).lossPercent !== null);
  const grouped = (keyOf: (row: ReportLot) => string) => {
    const map = new Map<string, { key: string; label: string; unit: string; lots: number; harvested: Prisma.Decimal; healthy: Prisma.Decimal; damaged: Prisma.Decimal; wasted: Prisma.Decimal; affected: Prisma.Decimal; money: Prisma.Decimal; valued: number }>();
    for (const row of rows) {
      const m = row.metrics!; const result = lossMetrics(m); const label = keyOf(row); const key = JSON.stringify([label, row.unit]);
      const current = map.get(key) ?? { key, label, unit: row.unit, lots: 0, harvested: new Prisma.Decimal(0), healthy: new Prisma.Decimal(0), damaged: new Prisma.Decimal(0), wasted: new Prisma.Decimal(0), affected: new Prisma.Decimal(0), money: new Prisma.Decimal(0), valued: 0 };
      current.lots++; current.harvested = current.harvested.add(m.harvested); current.healthy = current.healthy.add(m.marketable); current.damaged = current.damaged.add(m.damaged); current.wasted = current.wasted.add(m.wasted); current.affected = current.affected.add(result.affected!);
      if (result.monetaryLoss !== null) { current.valued++; current.money = current.money.add(result.monetaryLoss); }
      map.set(key, current);
    }
    return [...map.values()].map(row => ({ key: row.key, label: row.label, unit: row.unit, lots: row.lots, harvested: row.harvested.toString(), healthy: row.healthy.toString(), damaged: row.damaged.toString(), wasted: row.wasted.toString(), affected: row.affected.toString(), lossPercent: row.affected.div(row.harvested).mul(100).toFixed(2), monetaryLoss: row.valued === row.lots ? row.money.toFixed(2) : null, valuedLots: row.valued }));
  };
  const month = grouped(row => row.harvestDate.slice(0, 7)).sort((a, b) => a.label.localeCompare(b.label));
  const year = grouped(row => row.harvestDate.slice(0, 4)).sort((a, b) => a.label.localeCompare(b.label));
  const crop = grouped(row => row.crop);
  return { month, year, crop, includedLots: rows.length };
}

export function compareExpectedActual(expected: string | null | undefined, expectedUnit: string | null | undefined, lots: { harvested: string; unit: string }[]) {
  if (!expected || !expectedUnit) return { available: false as const, reason: "Expected harvest is not recorded." };
  if (!/^\d+(\.\d{1,3})?$/.test(expected) || !Number.isFinite(Number(expected)) || Number(expected) <= 0) return { available: false as const, reason: "Expected harvest quantity is invalid." };
  if (!lots.length) return { available: false as const, reason: "No actual harvest is recorded." };
  if (lots.some(lot => lot.unit !== expectedUnit)) return { available: false as const, reason: "Units differ. Reconcile units before comparison." };
  const actual = lots.reduce((sum, lot) => sum.add(lot.harvested), new Prisma.Decimal(0));
  const difference = actual.sub(expected);
  return { available: true as const, expected, actual: actual.toString(), unit: expectedUnit, difference: difference.toString(), differencePercent: difference.div(expected).mul(100).toFixed(2) };
}

export type PreventionProgressInput = { inspectedLots: number; harvestedLots: number; completedActivities: number; totalActivities: number; completedFollowUps: number; totalFollowUps: number };
export function preventionProgress(input: PreventionProgressInput) {
  const parts = [
    { label: "Harvest lots inspected", completed: input.inspectedLots, total: input.harvestedLots, weight: 0.4 },
    { label: "Prevention activities completed", completed: input.completedActivities, total: input.totalActivities, weight: 0.3 },
    { label: "Follow-ups completed", completed: input.completedFollowUps, total: input.totalFollowUps, weight: 0.3 },
  ].filter(part => part.total > 0).map(part => ({ ...part, ratio: Math.min(1, Math.max(0, part.completed / part.total)) }));
  if (!parts.length) return { score: null, parts };
  const weight = parts.reduce((sum, part) => sum + part.weight, 0);
  return { score: Math.round(parts.reduce((sum, part) => sum + part.ratio * part.weight, 0) / weight * 100), parts };
}
