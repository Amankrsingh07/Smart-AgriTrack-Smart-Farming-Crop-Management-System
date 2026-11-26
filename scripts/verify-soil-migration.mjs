import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
const db = new PrismaClient();
try {
  const reports = await db.fertilizerRecommendationHistory.findMany({
    select: {
      id: true,
      userId: true,
      input: true,
      result: true,
      createdAt: true,
    },
    orderBy: { id: "asc" },
  });
  const counts = {};
  for (const table of ["user", "farm", "field", "crop", "cropCycle"])
    counts[table] = await db[table].count();
  const snapshot = {
    counts,
    reports: reports.length,
    hash: createHash("sha256").update(JSON.stringify(reports)).digest("hex"),
  };
  const path = "/tmp/agritrack-soil-migration-audit.json";
  if (process.argv.includes("--before")) {
    await fs.writeFile(path, JSON.stringify(snapshot));
    console.log("Pre-migration audit recorded:", JSON.stringify(snapshot));
  } else {
    const before = JSON.parse(await fs.readFile(path, "utf8"));
    if (JSON.stringify(before) !== JSON.stringify(snapshot))
      throw new Error("Existing records changed during migration");
    console.log(
      "PASS: all existing report snapshots and entity counts match the pre-migration audit.",
    );
  }
} finally {
  await db.$disconnect();
}
