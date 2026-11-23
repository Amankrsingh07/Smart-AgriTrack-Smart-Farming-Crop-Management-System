import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

async function main() {
  const [file, first, last] = process.argv.slice(2);
  const from = Number(first);
  const through = Number(last ?? first);
  if (!file || !Number.isSafeInteger(from) || !Number.isSafeInteger(through) || from < 1 || through < from || through - from >= 20)
    throw new Error("Provide a local PDF path and an inclusive range of at most 20 PDF pages.");
  if ((await stat(file)).size > 60 * 1024 * 1024) throw new Error("PDF exceeds the 60 MB inspection limit.");
  const bytes = await readFile(file);
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("The publication must be a PDF.");
  const processResult = promisify(execFile)("pdftotext",
    ["-f", String(from), "-l", String(through), "-layout", "-enc", "UTF-8", "-", "-"],
    { timeout: 15000, maxBuffer: 1024 * 1024, encoding: "utf8" });
  processResult.child.stdin?.on("error", () => {});
  processResult.child.stdin?.end(bytes);
  const { stdout } = await processResult;
  console.log(JSON.stringify({ status: "UNREVIEWED_TRANSCRIPT", sha256: createHash("sha256").update(bytes).digest("hex"), from, through, text: stdout.trim() }, null, 2));
}

// Feed the bytes through stdin rather than passing an untrusted file name to the PDF program.
void main().catch(error => { console.error(error instanceof Error ? error.message : "Inspection failed."); process.exitCode = 1; });
