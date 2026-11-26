import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const migrations = "prisma/migrations";
const prediction = "20261101_india_crop_prediction";
const foundation = "20261101_phase1_database_foundation";
const legacyDrop = "202611110002_remove_crop_health_checks";
const stage = mkdtempSync(join(tmpdir(), "agritrack-migrations-"));

function deploy(schema) {
  const result = spawnSync(
    "prisma",
    ["migrate", "deploy", "--schema", schema],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

async function assertLegacyTableProtected() {
  const db = new PrismaClient();
  try {
    const tables = await db.$queryRaw`
      SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('CropDiseaseCheck', '_prisma_migrations')
    `;
    const names = new Set(tables.map((table) => table.name));
    if (!names.has("CropDiseaseCheck")) return;
    const applied =
      names.has("_prisma_migrations") &&
      (
        await db.$queryRaw`
      SELECT migration_name FROM _prisma_migrations
      WHERE migration_name = ${legacyDrop} AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      LIMIT 1
    `
      ).length > 0;
    if (!applied)
      throw new Error(
        `Deployment blocked: ${legacyDrop} would drop the existing CropDiseaseCheck table. Review backup and preservation before deploying.`,
      );
  } finally {
    await db.$disconnect();
  }
}

try {
  await assertLegacyTableProtected();
  // Apply the foundation first while preserving migration names and checksums
  // already recorded by existing databases. Prisma records both passes normally.
  const stagedMigrations = join(stage, "migrations");
  mkdirSync(stagedMigrations);
  cpSync("prisma/schema.prisma", join(stage, "schema.prisma"));
  cpSync(
    join(migrations, "migration_lock.toml"),
    join(stagedMigrations, "migration_lock.toml"),
  );
  for (const entry of readdirSync(migrations, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      (entry.name < prediction || entry.name === foundation)
    ) {
      cpSync(join(migrations, entry.name), join(stagedMigrations, entry.name), {
        recursive: true,
      });
    }
  }

  const prerequisiteStatus = deploy(join(stage, "schema.prisma"));
  process.exitCode = prerequisiteStatus || deploy("prisma/schema.prisma");
} finally {
  rmSync(stage, { recursive: true, force: true });
}
