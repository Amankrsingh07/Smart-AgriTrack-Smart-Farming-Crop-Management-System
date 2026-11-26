import { Prisma } from "@prisma/client";
import { closeCropCycleSchedules } from "@/lib/crop-calendar-service";
import { indiaDateKey, isCropCycleFinished } from "@/lib/crop-cycle-status";
import { db } from "@/lib/db";
import { calculateYieldPerAcre } from "@/lib/harvest";

export function validHarvestDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date &&
    date <= indiaDateKey(new Date())
  );
}

type HarvestInput = {
  cropCycleId: string;
  harvestDate: string;
  quantity: number;
  unit: string;
  grade?: string;
  notes?: string;
  storageDetails?: string;
};

export function recordHarvestLot(
  userId: string,
  input: HarvestInput,
  mode: "confirm" | "production",
) {
  return db.$transaction(
    async (tx) => {
      const ownedCycle = { id: input.cropCycleId, field: { farm: { userId } } };
      if (
        !(await tx.cropCycle.findFirst({
          where: ownedCycle,
          select: { id: true },
        }))
      )
        return { status: "missing" } as const;
      await tx.$queryRaw`SELECT id FROM CropCycle WHERE id = ${input.cropCycleId} FOR UPDATE`;
      const cycle = await tx.cropCycle.findFirst({
        where: ownedCycle,
        include: { field: true },
      });
      if (!cycle) return { status: "missing" } as const;
      if (mode === "confirm" && isCropCycleFinished(cycle))
        return { status: "already-harvested" } as const;

      const harvestDate = new Date(`${input.harvestDate}T00:00:00.000Z`);
      const quantity = new Prisma.Decimal(input.quantity).toDecimalPlaces(3);
      const existingLot = await tx.production.findFirst({
        where: {
          cropCycleId: cycle.id,
          harvestDate,
          quantity,
          unit: input.unit,
          ...(cycle.actualHarvestDate
            ? { grade: input.grade || null, notes: input.notes || null }
            : {}),
        },
        select: {
          id: true,
          grade: true,
          notes: true,
          storageDetails: true,
          yieldPerAcre: true,
        },
      });
      if (existingLot && cycle.actualHarvestDate)
        return { status: "duplicate" } as const;

      const yieldPerAcre = calculateYieldPerAcre(
        quantity.toNumber(),
        input.unit,
        Number(cycle.field.area),
        cycle.field.areaUnit,
      );
      if (!existingLot) {
        await tx.production.create({
          data: {
            cropCycleId: cycle.id,
            harvestDate,
            quantity,
            unit: input.unit,
            yieldPerAcre,
            grade: input.grade || null,
            notes: input.notes || null,
            storageDetails: input.storageDetails || null,
          },
        });
      } else {
        await tx.production.update({
          where: { id: existingLot.id },
          data: {
            yieldPerAcre: existingLot.yieldPerAcre ?? yieldPerAcre,
            grade: existingLot.grade ?? (input.grade || null),
            notes: existingLot.notes ?? (input.notes || null),
            storageDetails:
              existingLot.storageDetails ?? (input.storageDetails || null),
          },
        });
      }
      if (!cycle.actualHarvestDate) {
        const status = cycle.status === "COMPLETED" ? "COMPLETED" : "HARVESTED";
        await tx.cropCycle.update({
          where: { id: cycle.id },
          data: { status, actualHarvestDate: harvestDate },
        });
        await closeCropCycleSchedules(userId, cycle.id, status, tx);
      }
      return { status: "saved", yieldPerAcre } as const;
    },
    { isolationLevel: "ReadCommitted" },
  );
}
