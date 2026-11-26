import { createHash, randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import bihar from "../src/data/fertilizer/bihar-gfr-2026.json";
import { regionalDatasetSchema } from "../src/lib/fertilizer-dataset-validation";

const approvedFile = "src/data/fertilizer/regional-packages.json";
const metadataRoot =
  process.env.FERTILIZER_DATASET_REVIEW_DIR ?? ".fertilizer-dataset-review";
const pending = join(metadataRoot, "pending");
const history = join(metadataRoot, "history");
const hash = (content: string) =>
  createHash("sha256").update(content).digest("hex");

function validate(content: string) {
  const parsed = regionalDatasetSchema.parse(JSON.parse(content));
  const ids = new Set(
    (bihar.records as { id: string }[]).map((row) => String(row.id)),
  );
  if (parsed.records.some((row) => ids.has(row.id)))
    throw new Error(
      "Record ID conflicts with the separately maintained Bihar dataset.",
    );
  return parsed;
}

async function archive(file: string, content: string) {
  try {
    await writeFile(file, content, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

async function run() {
  const [action, argument, reviewer] = process.argv.slice(2);
  if (!["stage", "list", "approve", "rollback", "check"].includes(action))
    throw new Error(
      "Use stage <JSON>, list, approve <hash> <reviewer>, rollback <hash> <reviewer>, or check.",
    );
  const current = await readFile(approvedFile, "utf8");
  await Promise.all([
    mkdir(pending, { recursive: true }),
    mkdir(history, { recursive: true }),
  ]);
  const record = (event: string, detail: unknown) =>
    appendFile(
      join(metadataRoot, "audit.jsonl"),
      JSON.stringify({ time: new Date().toISOString(), event, detail }) + "\n",
    );
  if (action === "stage") {
    if (!argument) throw new Error("Provide a candidate JSON file.");
    const content = await readFile(argument, "utf8");
    const dataset = validate(content);
    const id = hash(content);
    await archive(join(pending, id + ".json"), content);
    await record("stage", { id, version: dataset.version });
    console.log({
      id,
      version: dataset.version,
      records: dataset.records.length,
      status: "pending human scientific review",
    });
  } else if (action === "list") {
    const versions = await readdir(history);
    console.log({
      current: hash(current),
      pending: (await readdir(pending)).filter(
        (file) => !versions.includes(file),
      ),
      history: versions,
    });
  } else if (action === "check") {
    const dataset = validate(current);
    const previousFile = join(metadataRoot, "source-checks.json");
    const previous: Record<string, string> = await readFile(
      previousFile,
      "utf8",
    )
      .then((raw) => JSON.parse(raw) as Record<string, string>)
      .catch(() => ({}));
    const outputs = [];
    for (const url of new Set(
      [...dataset.sources, bihar.source].map((source) => source.url),
    )) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
        });
        const bytes = response.ok
          ? Buffer.from(await response.arrayBuffer())
          : null;
        const digest = bytes
          ? createHash("sha256").update(bytes).digest("hex")
          : null;
        outputs.push({
          url,
          status: response.status,
          changed: digest && previous[url] ? digest !== previous[url] : null,
          digest,
        });
      } catch {
        outputs.push({
          url,
          status: "unavailable",
          changed: null,
          digest: null,
        });
      }
    }
    for (const row of outputs) if (row.digest) previous[row.url] = row.digest;
    await writeFile(previousFile, JSON.stringify(previous, null, 2));
    await record("check", outputs);
    console.log(outputs);
  } else {
    if (!argument || !/^[a-f0-9]{64}$/.test(argument) || !reviewer?.trim())
      throw new Error(
        "Provide the full content hash and reviewing operator name.",
      );
    const lock = join(metadataRoot, "promotion.lock");
    await mkdir(lock);
    try {
      const active = await readFile(approvedFile, "utf8");
      const content = await readFile(
        join(action === "approve" ? pending : history, argument + ".json"),
        "utf8",
      );
      if (hash(content) !== argument)
        throw new Error("Stored content hash does not match.");
      const dataset = validate(content);
      if (
        action === "approve" &&
        dataset.version === validate(active).version &&
        hash(active) !== argument
      )
        throw new Error("Assign a new version to changed content.");
      await Promise.all([
        archive(join(history, hash(active) + ".json"), active),
        archive(join(history, argument + ".json"), content),
      ]);
      const temp = approvedFile + "." + randomUUID() + ".tmp";
      await writeFile(temp, content, { flag: "wx" });
      await record(action, { from: hash(active), to: argument, reviewer });
      await rename(temp, approvedFile);
      console.log({
        active: argument,
        version: dataset.version,
        next: "Rebuild and deploy after verification.",
      });
    } finally {
      await rmdir(lock);
    }
  }
}
void run().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Dataset operation failed.",
  );
  process.exitCode = 1;
});
