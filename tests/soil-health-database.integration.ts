/** Explicit local integration check; writes are rolled back and never become saved user reports. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { analyzeSoil } from "../src/lib/soil-health";
import { soilHealthSchema } from "../src/lib/soil-health-validation";
import { requireTestDatabase } from "../src/lib/test-database-safety";
const db = new PrismaClient({
  datasourceUrl: requireTestDatabase(process.env.TEST_DATABASE_URL),
});
const email = `upgrade-${randomUUID()}@example.test`;
const rollback = new Error("ROLLBACK_TEST_ONLY");
async function main() {
  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: "Isolated soil fixture",
          passwordHash: "unused-test-only",
        },
      });
      const farm = await tx.farm.create({
        data: {
          userId: user.id,
          name: "Fixture farm",
          state: "Bihar",
          district: "Saran",
        },
      });
      const field = await tx.field.create({
        data: {
          farmId: farm.id,
          name: "Fixture field",
          area: 1,
          areaUnit: "hectare",
          soilType: "Alluvial",
          irrigationMethod: "Surface",
        },
      });
      const crop = await tx.crop.upsert({
        where: { name: "Wheat" },
        update: {},
        create: {
          name: "Wheat",
          seasons: "RABI",
          soilTypes: "Alluvial",
          waterNeed: "MEDIUM",
        },
      });
      const cycle = await tx.cropCycle.create({
        data: { fieldId: field.id, cropId: crop.id, season: "RABI" },
        include: { crop: true, field: { include: { farm: true } } },
      });
      await assert.rejects(
        tx.field.create({
          data: {
            farmId: "missing-farm",
            name: "Invalid fixture field",
            area: 1,
            soilType: "Alluvial",
            irrigationMethod: "Surface",
          },
        }),
        (error) =>
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2003",
      );
      const input = soilHealthSchema.parse({
        state: cycle.field.farm.state,
        district: cycle.field.farm.district,
        crop: cycle.crop.name,
        growthStage: "Vegetative",
        soilType: cycle.field.soilType,
        soilPh: 8.2,
        phMethod: "Soil water (1:2.5)",
        phosphorusValue: 35,
        phosphorusUnit: "kg/ha",
        phosphorusBasis: "P₂O₅",
        phosphorusMethod: "Olsen bicarbonate method",
        referenceStandardId: "BIHAR_CSTL_GOI_2011",
        organicCarbonPercent: 0.45,
        sampleDate: "2026-10-01",
        fieldId: cycle.fieldId,
        farmId: cycle.field.farmId,
        cropId: cycle.cropId,
        cropCycleId: cycle.id,
      });
      const row = await tx.fertilizerRecommendationHistory.create({
        data: {
          userId: cycle.field.farm.userId,
          farmId: input.farmId,
          fieldId: input.fieldId,
          cropId: input.cropId,
          cropCycleId: input.cropCycleId,
          sampleDate: new Date(`${input.sampleDate}T00:00:00Z`),
          input: input as Prisma.InputJsonValue,
          result: analyzeSoil(input) as Prisma.InputJsonValue,
        },
        include: {
          user: { select: { id: true } },
          farm: true,
          field: true,
          crop: true,
          cropCycle: true,
        },
      });
      assert.equal(row.user.id, cycle.field.farm.userId);
      assert.equal(row.field?.id, cycle.fieldId);
      assert.equal(row.crop?.id, cycle.cropId);
      assert.equal(row.cropCycle?.id, cycle.id);
      assert.equal(
        (row.input as Record<string, unknown>).organicCarbonPercent,
        0.45,
      );
      const persisted = soilHealthSchema.parse(row.input);
      assert.equal(persisted.phosphorusValue, 35);
      assert.equal(persisted.phosphorusUnit, "kg/ha");
      assert.equal(persisted.phosphorusBasis, "P2O5");
      assert.equal(persisted.phosphorusMethod, "Olsen bicarbonate method");
      assert.equal(persisted.phMethod, "WATER_1_2_5");
      const screening = row.result as ReturnType<typeof analyzeSoil>;
      assert.equal(screening.nutrients[1].rating, "Medium");
      assert.equal(screening.nutrients[1].interpretation?.value, 15.295);
      assert.equal(
        (row.result as Record<string, unknown>).version,
        "smart-soil-v2",
      );
      assert.equal(
        await tx.fertilizerRecommendationHistory.count({
          where: { id: row.id, userId: "another-user" },
        }),
        0,
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
    assert.equal(await db.user.count({ where: { email } }), 0);
    console.log(
      "PASS: migrated DB persists linked soil report and owner scope; transaction rolled back.",
    );
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
