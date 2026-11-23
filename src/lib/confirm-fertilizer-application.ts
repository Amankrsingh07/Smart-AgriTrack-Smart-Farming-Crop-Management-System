import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { indiaDateKey } from "./crop-cycle-status";
import { jsonValue, reconcileFertilizerSchedules } from "./fertilizer-service";
import { compositionSchema } from "./smart-fertilizer";

export const applicationConfirmation = z.object({
  productId: z.string().min(1).max(191),
  requestKey: z.uuid(),
  version: z.number().int().positive(),
  appliedOn: z.iso.date().refine(date => date >= "1900-01-01" && date <= indiaDateKey(new Date())),
  quantityKg: z.number().finite().min(.001).max(9999999.999).refine(value => new Prisma.Decimal(value).decimalPlaces() <= 3),
  cost: z.number().finite().min(0).max(999999999).refine(value => new Prisma.Decimal(value).decimalPlaces() <= 2).optional(),
});

export async function confirmFertilizerApplication(userId: string, id: string, input: z.infer<typeof applicationConfirmation>) {
  return db.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT a.id FROM FertilizerApplication a JOIN CropCycle c ON c.id=a.cropCycleId JOIN Field f ON f.id=c.fieldId JOIN Farm m ON m.id=f.farmId WHERE a.id=${id} AND m.userId=${userId} FOR UPDATE`;
    if (!locked.length) return { status: 404, error: "Application unavailable." } as const;
    const app = await tx.fertilizerApplication.findUniqueOrThrow({ where: { id }, include: { cropCycle: { include: { field: true } } } });
    const revisions = Array.isArray(app.revisions) ? app.revisions : [];
    const confirmation = revisions.find(row => row && typeof row === "object" && !Array.isArray(row) && row.event === "stock-confirmation" && row.requestKey === input.requestKey);
    if (confirmation && typeof confirmation === "object" && !Array.isArray(confirmation)) {
      const same = confirmation.productId === input.productId && confirmation.appliedOn === input.appliedOn &&
        confirmation.quantityKg === input.quantityKg && (confirmation.cost ?? null) === (input.cost ?? null);
      return same ? { replayed: true, id } : { status: 409, error: "Request key already used with different details." } as const;
    }
    if (app.status !== "PLANNED" || app.version !== input.version || app.expenseId) return { status: 409, error: "The application has changed. Reload before confirming." } as const;
    const cycle = app.cropCycle;
    if (cycle.sowingDate && input.appliedOn < indiaDateKey(cycle.sowingDate) || cycle.actualHarvestDate && input.appliedOn > indiaDateKey(cycle.actualHarvestDate))
      return { status: 400, error: "Application date is outside the crop cycle." } as const;
    const products = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM FertilizerProduct WHERE id=${input.productId} AND ownerId=${userId} FOR UPDATE`;
    if (!products.length) return { status: 404, error: "Stock product unavailable." } as const;
    const product = await tx.fertilizerProduct.findUniqueOrThrow({ where: { id: input.productId } });
    const expected = compositionSchema.safeParse(app.composition);
    const actual = compositionSchema.safeParse(product.composition);
    if (product.name.trim().toLowerCase() !== app.product.trim().toLowerCase() || !expected.success || !actual.success ||
      (["n", "p2o5", "k2o"] as const).some(key => actual.data[key] !== expected.data[key]))
      return { status: 400, error: "The stock product must match the recorded product and grade." } as const;
    const quantity = new Prisma.Decimal(input.quantityKg);
    // Ledger adjustments remain append-only. Preserve historical balances when recording older applications.
    const movements = await tx.fertilizerStockMovement.groupBy({ by: ["occurredOn"], where: { productId: product.id }, _sum: { deltaKg: true }, orderBy: { occurredOn: "asc" } });
    let balance = new Prisma.Decimal(0);
    const appliedDate = new Date(input.appliedOn);
    for (const row of movements) {
      if (row.occurredOn > appliedDate && balance.lt(quantity))
        return { status: 409, error: "Stock would be negative on an affected date." } as const;
      balance = balance.plus(row._sum.deltaKg ?? 0);
    }
    if (balance.lt(quantity)) return { status: 409, error: "Insufficient recorded stock." } as const;
    await tx.fertilizerStockMovement.create({ data: { productId: product.id, requestKey: createHash("sha256").update(`application:${id}`).digest("hex"), kind: "USE",
      occurredOn: appliedDate, deltaKg: quantity.negated(), note: `Confirmed fertilizer application ${id}` } });
    const expense = input.cost === undefined ? null : await tx.expense.create({ data: {
      userId, farmId: cycle.field.farmId, fieldId: cycle.fieldId, cropCycleId: cycle.id, category: "FERTILIZER",
      amount: input.cost, date: appliedDate, description: `Recorded application · ${app.product}`,
    } });
    await tx.fertilizerApplication.update({ where: { id }, data: { status: "APPLIED", quantityKg: quantity, appliedDate,
      cost: input.cost, expenseId: expense?.id, version: { increment: 1 },
      revisions: jsonValue([...revisions, { event: "stock-confirmation", ...input, previous: { version: app.version, quantityKg: app.quantityKg, status: app.status } }]) } });
    await reconcileFertilizerSchedules(userId, cycle.id, tx);
    return { replayed: false, id };
  }, { isolationLevel: "ReadCommitted" });
}
