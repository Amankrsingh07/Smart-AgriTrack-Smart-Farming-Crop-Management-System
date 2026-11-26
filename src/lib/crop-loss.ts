import { valuationIssues, type ValuationIssue } from "./crop-loss-valuation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { indiaDateKey } from "./crop-cycle-status";
export function resolveHarvestLot<
  T extends { id: string; cropCycleId: string },
>(items: T[], cropCycleId: string, harvestedLotId?: string): T | undefined {
  if (harvestedLotId)
    return items.find(
      (item) => item.id === harvestedLotId && item.cropCycleId === cropCycleId,
    );
  return items.find((item) => item.cropCycleId === cropCycleId);
}
export function allocationMatches(
  total: string,
  marketable: string,
  damaged: string,
  wasted: string,
) {
  try {
    return new Prisma.Decimal(marketable).add(damaged).add(wasted).eq(total);
  } catch {
    return false;
  }
}
const quantity = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, "Use up to three quantity decimals.");
const money = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Use up to two price decimals.")
  .optional();
export const cropLossSchema = z
  .object({
    mode: z.literal("REAL").default("REAL"),
    synthetic: z.literal(false).default(false),
    dataLabel: z.literal("REAL").optional(),
    productionId: z.string().min(1).max(191),
    harvestedLotId: z.string().min(1).max(191).optional(),
    cropCycleId: z.string().min(1).max(191).optional(),
    totalHarvested: quantity.optional(),
    version: z.number().int().min(0),
    assessedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value &&
          value <= indiaDateKey(new Date())
        );
      }, "Use a real assessment date, not a future date."),
    marketable: quantity,
    damaged: quantity,
    wasted: quantity,
    unit: z.string().trim().min(1).max(24),
    quantitiesConfirmed: z.literal(true, {
      error:
        "Confirm that quantities were measured and the categories do not overlap.",
    }),
    evidence: z.string().trim().min(3).max(500),
    pricePerUnit: money,
    damagedRecovery: money,
    priceEvidence: z.string().trim().max(500).optional(),
    priceConfirmed: z.boolean().default(false),
    cause: z.enum([
      "Unknown",
      "Weather exposure",
      "Storage",
      "Handling",
      "Pest or disease observed",
      "Other",
    ]),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.harvestedLotId && input.harvestedLotId !== input.productionId)
      ctx.addIssue({
        code: "custom",
        path: ["harvestedLotId"],
        message: "Harvest lot and production record must match.",
      });
    for (const issue of valuationIssues(input)) {
      if (
        input.priceConfirmed ||
        [
          "INVALID_PRICE",
          "INVALID_RECOVERY",
          "RECOVERY_EXCEEDS_VALUE",
        ].includes(issue.code)
      ) {
        ctx.addIssue({
          code: "custom",
          path: [issue.field],
          message: issue.message,
        });
      }
    }
  });
export type LossInput = z.infer<typeof cropLossSchema>;
export function lossAllocationError(
  input: LossInput,
  lot: {
    quantity: string;
    unit: string;
    harvestDate: string;
    sales: { quantity: string; unit: string }[];
  },
): string | null {
  if (input.unit !== lot.unit)
    return "Use the exact harvest lot unit. No bag/crate or mass conversion is inferred.";
  if (input.assessedDate < lot.harvestDate)
    return "Assessment cannot precede the harvest date.";
  if (lot.sales.some((sale) => sale.unit !== lot.unit))
    return "Sale and harvest units disagree. Reconcile the original records first.";
  const market = new Prisma.Decimal(input.marketable),
    damaged = new Prisma.Decimal(input.damaged),
    wasted = new Prisma.Decimal(input.wasted);
  if (!market.add(damaged).add(wasted).eq(lot.quantity))
    return "Marketable + damaged + wasted must equal the existing harvested quantity. Categories must not overlap.";
  const sold = lot.sales.reduce(
    (sum, sale) => sum.add(sale.quantity),
    new Prisma.Decimal(0),
  );
  if (market.lt(sold))
    return "Marketable quantity includes already sold produce and cannot be below recorded sales.";
  if (
    input.priceConfirmed &&
    new Prisma.Decimal(input.damagedRecovery!).gt(
      damaged.mul(input.pricePerUnit!),
    )
  )
    return "Damaged recovery cannot exceed its full-quality reference value. Review price or recovery evidence.";
  return null;
}
export type LossMetricInput = {
  harvested: string;
  marketable: string;
  damaged: string;
  wasted: string;
  quantitiesConfirmed: boolean;
  priceConfirmed: boolean;
  pricePerUnit: string | null;
  damagedRecovery: string | null;
  priceEvidence?: string | null;
};
export function lossMetrics(input: LossMetricInput) {
  const harvested = new Prisma.Decimal(input.harvested),
    affected = new Prisma.Decimal(input.damaged).add(input.wasted);
  const valid =
    input.quantitiesConfirmed &&
    [input.marketable, input.damaged, input.wasted].every((value) =>
      new Prisma.Decimal(value).gte(0),
    ) &&
    harvested.gt(0) &&
    new Prisma.Decimal(input.marketable).add(affected).eq(harvested);
  const issues: ValuationIssue[] = valuationIssues(input);
  if (!valid)
    issues.unshift({
      code: "INVALID_ALLOCATION",
      field: "quantities",
      message:
        "Harvest allocation is missing, unconfirmed or inconsistent with the source lot. Reconcile measured quantities before valuation.",
    });
  const complete = issues.length === 0;
  const breakdown = complete
    ? {
        pricePerUnit: input.pricePerUnit!,
        damagedFullValue: new Prisma.Decimal(input.damaged)
          .mul(input.pricePerUnit!)
          .toString(),
        damagedRecovery: input.damagedRecovery!,
        discardedFullValue: new Prisma.Decimal(input.wasted)
          .mul(input.pricePerUnit!)
          .toString(),
      }
    : null;
  return {
    affected: valid ? affected.toString() : null,
    lossPercent: valid ? affected.div(harvested).mul(100).toFixed(2) : null,
    wastePercent: valid
      ? new Prisma.Decimal(input.wasted).div(harvested).mul(100).toFixed(2)
      : null,
    monetaryLoss: complete
      ? affected.mul(input.pricePerUnit!).sub(input.damagedRecovery!).toFixed(2)
      : null,
    valuationIssues: issues,
    breakdown,
  };
}
/** No unit conversion: group by exact unit; unknown valuations never become zero. */
export function lossAnalytics(
  rows: Array<{
    year: string;
    season: string;
    crop: string;
    field: string;
    cropKey?: string;
    fieldKey?: string;
    unit: string;
    metrics: LossMetricInput;
  }>,
) {
  const result: Record<
    string,
    Array<{
      key: string;
      label: string;
      unit: string;
      harvested: string;
      affected: string;
      lossPercent: string | null;
      monetaryLoss: string | null;
      lots: number;
      valuedLots: number;
      valuationIssues: Array<ValuationIssue & { lotCount: number }>;
    }>
  > = {};
  for (const dimension of ["year", "season", "crop", "field"] as const) {
    const groups = new Map<string, (typeof result)[string][number]>();
    for (const row of rows) {
      const identity =
        dimension === "crop"
          ? (row.cropKey ?? row.crop)
          : dimension === "field"
            ? (row.fieldKey ?? row.field)
            : row[dimension];
      const key = JSON.stringify([identity, row.unit]);
      const current = groups.get(key) ?? {
        key,
        label: row[dimension],
        unit: row.unit,
        harvested: "0",
        affected: "0",
        lossPercent: null,
        monetaryLoss: "0.00",
        lots: 0,
        valuedLots: 0,
        valuationIssues: [],
      };
      const m = lossMetrics(row.metrics);
      if (m.lossPercent === null) continue;
      current.harvested = new Prisma.Decimal(current.harvested)
        .add(row.metrics.harvested)
        .toString();
      current.affected = new Prisma.Decimal(current.affected)
        .add(m.affected!)
        .toString();
      current.lots++;
      for (const issue of m.valuationIssues) {
        const existing = current.valuationIssues.find(
          (item) => item.code === issue.code,
        );
        if (existing) existing.lotCount++;
        else current.valuationIssues.push({ ...issue, lotCount: 1 });
      }
      if (m.monetaryLoss !== null) {
        current.valuedLots++;
        current.monetaryLoss = new Prisma.Decimal(current.monetaryLoss ?? 0)
          .add(m.monetaryLoss)
          .toFixed(2);
      }
      current.lossPercent = new Prisma.Decimal(current.affected)
        .div(current.harvested)
        .mul(100)
        .toFixed(2);
      groups.set(key, current);
    }
    result[dimension] = [...groups.values()].map((row) => ({
      ...row,
      monetaryLoss: row.valuedLots === row.lots ? row.monetaryLoss : null,
    }));
  }
  return result;
}
