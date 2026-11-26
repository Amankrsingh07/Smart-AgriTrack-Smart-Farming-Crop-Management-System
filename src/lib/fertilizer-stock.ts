import { Prisma } from "@prisma/client";
import { z } from "zod";
import { indiaDateKey } from "./crop-cycle-status";
import { db } from "./db";

const optionalText = (limit: number) => z.string().trim().max(limit).optional();
export const fertilizerStockSchema = z
  .object({
    productId: z.string().min(1).max(191),
    requestKey: z.uuid(),
    kind: z.enum(["OPENING", "PURCHASE", "USE", "ADJUST_IN", "ADJUST_OUT"]),
    quantityKg: z
      .number()
      .finite()
      .min(0.001)
      .max(9999999.999)
      .refine((value) => new Prisma.Decimal(value).decimalPlaces() <= 3),
    occurredOn: z.iso
      .date()
      .refine(
        (value) => value >= "1900-01-01" && value <= indiaDateKey(new Date()),
      ),
    supplier: optionalText(120),
    batchNumber: optionalText(80),
    note: optionalText(300),
    totalCost: z
      .number()
      .finite()
      .min(0)
      .max(999999999)
      .refine((value) => new Prisma.Decimal(value).decimalPlaces() <= 2)
      .optional(),
  })
  .superRefine((input, ctx) => {
    if (
      (input.kind === "ADJUST_IN" || input.kind === "ADJUST_OUT") &&
      !input.note
    )
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "State the reason for the stock adjustment.",
      });
    if (input.totalCost !== undefined && input.kind !== "PURCHASE")
      ctx.addIssue({
        code: "custom",
        path: ["totalCost"],
        message: "Only purchase movements can store purchase cost.",
      });
  });

type Movement = z.infer<typeof fertilizerStockSchema>;
export async function recordFertilizerMovement(
  ownerId: string,
  input: Movement,
) {
  return db.$transaction(
    async (tx) => {
      // Every write locks the same product before reading stock. The ledger is append-only.
      const locked = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM FertilizerProduct WHERE id = ${input.productId} AND ownerId = ${ownerId} FOR UPDATE`;
      if (!locked.length)
        return {
          error: "Fertilizer product unavailable.",
          status: 404,
        } as const;
      const where = { productId: input.productId };
      const deltaKg = new Prisma.Decimal(input.quantityKg).mul(
        input.kind === "USE" || input.kind === "ADJUST_OUT" ? -1 : 1,
      );
      const existing = await tx.fertilizerStockMovement.findUnique({
        where: {
          productId_requestKey: { ...where, requestKey: input.requestKey },
        },
      });
      if (existing) {
        if (
          !existing.deltaKg.equals(deltaKg) ||
          existing.kind !== input.kind ||
          existing.occurredOn.toISOString().slice(0, 10) !== input.occurredOn ||
          existing.batchNumber !== (input.batchNumber || null) ||
          existing.supplier !== (input.supplier || null) ||
          existing.note !== (input.note || null) ||
          (existing.totalCost?.toString() ?? null) !==
            (input.totalCost === undefined
              ? null
              : new Prisma.Decimal(input.totalCost).toString())
        ) {
          return {
            error:
              "This request key already identifies a different stock movement.",
            status: 409,
          } as const;
        }
        return { movement: existing, replayed: true };
      }
      const current = await tx.fertilizerStockMovement.aggregate({
        where,
        _sum: { deltaKg: true },
        _count: true,
        _max: { occurredOn: true },
      });
      if (input.kind === "OPENING" && current._count)
        return {
          error:
            "Opening stock can only be recorded before other stock movements.",
          status: 409,
        } as const;
      if (
        current._max.occurredOn &&
        input.occurredOn < current._max.occurredOn.toISOString().slice(0, 10)
      )
        return {
          error: "Record a dated adjustment to correct past stock.",
          status: 409,
        } as const;
      if (
        (current._sum.deltaKg ?? new Prisma.Decimal(0))
          .add(deltaKg)
          .isNegative()
      )
        return {
          error: "This movement would make stock negative.",
          status: 409,
        } as const;
      const movement = await tx.fertilizerStockMovement.create({
        data: {
          ...where,
          deltaKg,
          requestKey: input.requestKey,
          kind: input.kind,
          occurredOn: new Date(input.occurredOn),
          supplier: input.supplier || null,
          batchNumber: input.batchNumber || null,
          note: input.note || null,
          totalCost: input.totalCost,
        },
      });
      if (input.kind === "PURCHASE" && input.totalCost !== undefined)
        await tx.fertilizerPrice.create({
          data: { ...where, bagKg: input.quantityKg, price: input.totalCost },
        });
      return { movement, replayed: false };
    },
    { isolationLevel: "ReadCommitted" },
  );
}
