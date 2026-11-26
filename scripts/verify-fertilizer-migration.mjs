import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
const url = new URL(process.env.TEST_DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  !/^agritrack_.*_test$/.test(url.pathname.slice(1))
)
  throw Error("Dedicated local test database required");
const db = new PrismaClient({ datasourceUrl: url.toString() });
const tag = randomUUID();
let userId, cropId;
try {
  userId = (
    await db.user.create({
      data: {
        email: `migration-${tag}@example.test`,
        name: "ISOLATED MIGRATION TEST",
        passwordHash: "fixture",
      },
    })
  ).id;
  const farm = await db.farm.create({
    data: {
      userId,
      name: "MIGRATION TEST",
      state: "Maharashtra",
      district: "Pune",
    },
  });
  const field = await db.field.create({
    data: {
      farmId: farm.id,
      name: "MIGRATION TEST",
      area: 1,
      soilType: "Black",
      irrigationMethod: "Surface",
    },
  });
  cropId = (
    await db.crop.create({
      data: {
        name: `MIGRATION TEST ${tag}`,
        seasons: "KHARIF",
        soilTypes: "Black",
        waterNeed: "MEDIUM",
      },
    })
  ).id;
  const cycle = await db.cropCycle.create({
    data: { fieldId: field.id, cropId, season: "KHARIF" },
  });
  await db.fertilizerRecommendationHistory.create({
    data: {
      userId,
      farmId: farm.id,
      fieldId: field.id,
      cropCycleId: cycle.id,
      cropId,
      input: { fixture: true, nitrogenKgHa: 0, nutrientUnit: "mg/kg" },
      result: { fixture: true, unchanged: "original" },
    },
  });
  await db.expense.create({
    data: {
      userId,
      farmId: farm.id,
      cropCycleId: cycle.id,
      category: "FERTILIZER",
      amount: 123.45,
    },
  });
  await db.production.create({
    data: {
      cropCycleId: cycle.id,
      harvestDate: new Date("2026-01-01"),
      quantity: 100,
      unit: "kg",
    },
  });
  await db.alert.create({
    data: { userId, title: "TEST", message: "Preserve me" },
  });
  const snapshot = async () => {
    const rows = await Promise.all(
      [
        "user",
        "farm",
        "field",
        "crop",
        "cropCycle",
        "fertilizerRecommendationHistory",
        "expense",
        "production",
        "alert",
      ].map((model) => db[model].findMany({ orderBy: { id: "asc" } })),
    );
    return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  };
  const before = await snapshot();
  const sql = await readFile(
    new URL(
      "../prisma/migrations/202611140004_smart_fertilizer/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const statement of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await db.$executeRawUnsafe(statement);
  if (before !== (await snapshot()))
    throw Error("Existing record snapshot changed");
  console.log(
    "PASS: additive migration applied to pre-change schema; complete row hashes match across nine existing tables, including original soil JSON, expenses, harvest and reminders.",
  );
} finally {
  if (userId) await db.user.delete({ where: { id: userId } });
  if (cropId) await db.crop.delete({ where: { id: cropId } });
  await db.$disconnect();
}
