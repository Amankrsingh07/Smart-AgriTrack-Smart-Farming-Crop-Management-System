import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  handleExpectedHarvestPatch,
  type ExpectedHarvestInput,
} from "@/lib/expected-harvest-api";

async function saveOwnedCropCycle(userId: string, input: ExpectedHarvestInput) {
  return db.$transaction(
    async (tx) => {
      // Check ownership before writing; do not disclose whether another farmer's cycle exists.
      const cycle = await tx.cropCycle.findFirst({
        where: { id: input.cropCycleId, field: { farm: { userId } } },
        select: { id: true },
      });
      if (!cycle) return null;
      const updated = await tx.cropCycle.update({
        where: { id: cycle.id },
        data: {
          expectedHarvestQuantity: new Prisma.Decimal(
            input.expectedHarvestQuantity,
          ),
          expectedHarvestUnit: input.expectedHarvestUnit,
        },
        select: { expectedHarvestQuantity: true, expectedHarvestUnit: true },
      });
      if (!updated.expectedHarvestQuantity || !updated.expectedHarvestUnit)
        throw new Error(
          "Expected-harvest fields were not returned after update.",
        );
      return {
        quantity: updated.expectedHarvestQuantity.toFixed(3),
        unit: updated.expectedHarvestUnit,
      };
    },
    { isolationLevel: "ReadCommitted" },
  );
}

export async function PATCH(request: Request) {
  return handleExpectedHarvestPatch(request, {
    getUser: async () => {
      const user = await getUser();
      return user ? { id: user.id } : null;
    },
    allowRequest: (userId) =>
      checkRateLimit(`crop-loss-expected:${userId}`, 15).allowed,
    save: saveOwnedCropCycle,
    onDatabaseError: (error, reference) => {
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : "UNEXPECTED";
      console.error("Expected harvest save failed", { reference, code });
    },
  });
}
