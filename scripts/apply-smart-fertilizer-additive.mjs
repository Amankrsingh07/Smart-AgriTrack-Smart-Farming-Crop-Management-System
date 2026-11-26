/** Targeted additive migration only. Never deploy the unrelated pending queue. */
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
nextEnv.loadEnvConfig(process.cwd());
const migration = "202611140004_smart_fertilizer";
const allowed = new Set([
  "FertilizerReference",
  "FertilizerPlan",
  "FertilizerProduct",
  "FertilizerPrice",
  "FertilizerApplication",
  "FertilizerAnalysis",
]);
const sql = await readFile(
  `prisma/migrations/${migration}/migration.sql`,
  "utf8",
);
const statements = sql
  .replace(/^--.*$/gm, "")
  .split(";")
  .map((v) => v.trim())
  .filter(Boolean);
for (const statement of statements) {
  const match = statement.match(/^(?:CREATE TABLE|ALTER TABLE) `([^`]+)`/);
  if (
    !match ||
    !allowed.has(match[1]) ||
    /\b(?:DROP|TRUNCATE|INSERT|UPDATE|DELETE)\s+(?:TABLE|FROM|INTO|SET)/i.test(
      statement,
    )
  )
    throw Error("Migration is not the reviewed additive table-only migration");
}
const db = new PrismaClient({ log: [] });
try {
  const ledger =
    await db.$queryRaw`SELECT migration_name,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name = ${migration}`;
  const tables =
    await db.$queryRaw`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('FertilizerReference','FertilizerPlan','FertilizerProduct','FertilizerPrice','FertilizerApplication','FertilizerAnalysis')`;
  if (ledger.some((v) => v.finished_at && !v.rolled_back_at)) {
    console.log(JSON.stringify({ status: "ALREADY_APPLIED", migration }));
    process.exitCode = 0;
  } else {
    if (tables.length)
      throw Error(
        "Partial or externally applied tables detected; refusing to guess migration state",
      );
    const evidence = {
      migration,
      sha256: createHash("sha256").update(sql).digest("hex"),
      statements: statements.length,
      newTables: [...allowed],
      existingFarmerTablesAltered: false,
      status: "REVIEWED_ADDITIVE_ONLY",
    };
    await writeFile(
      "/tmp/agritrack-smart-fertilizer-migration-plan.json",
      JSON.stringify(evidence, null, 2),
    );
    if (!process.argv.includes("--apply"))
      console.log(JSON.stringify(evidence));
    else {
      for (const statement of statements) await db.$executeRawUnsafe(statement);
      const resolve = spawnSync(
        process.execPath,
        [
          "node_modules/prisma/build/index.js",
          "migrate",
          "resolve",
          "--applied",
          migration,
          "--schema",
          "prisma/schema.prisma",
        ],
        { env: { ...process.env }, encoding: "utf8" },
      );
      if (resolve.status !== 0)
        throw Error(
          "Tables created but migration ledger resolve failed. Do not rerun blindly; inspect metadata.",
        );
      const after =
        await db.$queryRaw`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('FertilizerReference','FertilizerPlan','FertilizerProduct','FertilizerPrice','FertilizerApplication','FertilizerAnalysis')`;
      if (after.length !== allowed.size)
        throw Error("Post-migration table count differs");
      console.log(
        JSON.stringify({
          ...evidence,
          status: "APPLIED_AND_RECORDED",
          tableCount: after.length,
        }),
      );
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: "FAILED",
      code: error?.code ?? "MIGRATION_ERROR",
      message: error?.code
        ? "Database operation failed; inspect metadata before any retry"
        : error?.message,
    }),
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
