/** Run only against an explicitly configured disposable local test database. */
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { requireTestDatabase } from "../src/lib/test-database-safety";
loadEnvFile(".env.test.local");
const url = requireTestDatabase(process.env.TEST_DATABASE_URL);
const db = new PrismaClient({ datasourceUrl: url });
async function fingerprint() {
  const rows = await Promise.all([
    db.state.findMany({ select: { id: true } }),
    db.district.findMany({ select: { id: true } }),
    db.crop.findMany({ select: { id: true } }),
    db.cropSeason.findMany({ select: { id: true } }),
    db.cropSoilRequirement.findMany({ select: { id: true } }),
    db.cropClimateRequirement.findMany({ select: { id: true } }),
    db.cropLocationSuitability.findMany({ select: { id: true } }),
    db.cropDistrictSuitability.findMany({ select: { id: true } }),
    db.cropWaterStage.findMany({ select: { id: true } }),
  ]);
  return rows.map((r) => ({
    count: r.length,
    identityHash: createHash("sha256")
      .update(
        r
          .map((v) => v.id)
          .sort()
          .join("\n"),
      )
      .digest("hex"),
  }));
}
async function main() {
  let first: string | undefined;
  try {
    for (let pass = 1; pass <= 2; pass++) {
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "prisma/seed.ts"],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: url },
          encoding: "utf8",
        },
      );
      if (result.status !== 0)
        throw new Error(
          `Seed pass ${pass} failed; no non-test database was used.`,
        );
      const current = await fingerprint();
      if (pass === 1) {
        first = JSON.stringify(current);
      } else {
        if (first !== JSON.stringify(current))
          throw new Error("Repeated seed changed row counts or identities");
        console.log(
          JSON.stringify({
            status: "PASS",
            scope:
              "Two sequential runs on disposable test database; row counts and IDs stable",
            models: [
              "State",
              "District",
              "Crop",
              "CropSeason",
              "CropSoilRequirement",
              "CropClimateRequirement",
              "CropLocationSuitability",
              "CropDistrictSuitability",
              "CropWaterStage",
            ],
            counts: current.map((r) => r.count),
          }),
        );
      }
    }
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Seed verification failed",
  );
  process.exitCode = 1;
});
