import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
// This tool creates only a dedicated database; it never alters the source DB.
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw Error("Local MySQL required");
const database = "agritrack_soil_test";
const db = new PrismaClient();
try {
  await db.$executeRawUnsafe(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
} finally {
  await db.$disconnect();
}
url.pathname = `/${database}`;
await fs.writeFile(
  ".env.test.local",
  `TEST_DATABASE_URL=${JSON.stringify(url.toString())}\nDATABASE_URL=${JSON.stringify(url.toString())}\nSESSION_SECRET=${JSON.stringify("isolated-soil-tests-only-32-characters-minimum")}\n`,
  { mode: 0o600 },
);
console.log(
  "Dedicated local test database configured; application database unchanged.",
);
