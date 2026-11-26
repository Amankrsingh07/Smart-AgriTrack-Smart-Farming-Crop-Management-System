import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
// Next never emits space-number duplicate filenames. Remove only those within
// its disposable type outputs; preserve all canonical generated route checks.
async function clean(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(
    () => [],
  )) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await clean(file);
    else if (/ \d+\.tsx?$/.test(entry.name)) {
      await unlink(file);
      console.log(`Removed duplicate generated type: ${file}`);
    }
  }
}
for (const dir of [".next/types", ".next-dev/types"]) await clean(dir);
