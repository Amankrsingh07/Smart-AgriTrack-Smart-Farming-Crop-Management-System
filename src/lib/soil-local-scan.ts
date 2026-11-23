import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { soilOcrSettings } from "./soil-ocr-settings";
import type { SoilExtractionDraft } from "./soil-report-extraction";

const run = promisify(execFile);

export function draftFromSoilText(text: string): SoilExtractionDraft | null {
  const lines = text.split(/\r?\n/);
  const headers = { laboratoryName: "Laboratory(?: name)?", reportNumber: "Report (?:number|no\\.?)", sampleDate: "Sampling date", reportDate: "Report date", nitrogenMethod: "Nitrogen method", phosphorusMethod: "Phosphorus method", potassiumMethod: "Potassium method", organicCarbonMethod: "Organic carbon method" } as const;
  const draft: SoilExtractionDraft = {};
  for (const [key, label] of Object.entries(headers) as [keyof typeof headers, string][]) {
    const matches = lines.flatMap(line => line.match(new RegExp(`^\\s*${label}\\s*:\\s*(.{1,100}?)\\s*$`, "i"))?.[1] ?? []);
    if (matches.length === 1 && (!key.endsWith("Date") || /^\d{4}-\d{2}-\d{2}$/.test(matches[0]))) draft[key] = matches[0];
  }
  const phValues = lines.flatMap(line => {
    const match = /^\s*(?:Soil )?pH\s*:\s*(\d+(?:\.\d+)?)\s*$/i.exec(line);
    return match && Number(match[1]) <= 14 ? [Number(match[1])] : [];
  });
  const phMethods = lines.filter(line => /^\s*pH method\s*:/i.test(line));
  if (phValues.length === 1) draft.soilPh = phValues[0];
  if (phValues.length === 1 && phMethods.length === 1 && /^\s*pH method\s*:\s*(?:Soil[: ]+)?Water\s+1\s*:\s*2\.5\s*$/i.test(phMethods[0])) {
    draft.phMethod = "WATER_1_2_5";
  }
  const readings = lines.flatMap(line => {
    const match = line.match(/^\s*(N|P2O5|P|K2O|K)\s*:\s*(\d+(?:\.\d+)?)\s*(kg\/ha|kg\/acre|mg\/kg)\s*$/);
    if (!match || Number(match[2]) > 100000) return [];
    return [{ basis: match[1], value: Number(match[2]), unit: match[3] as "kg/ha" | "kg/acre" | "mg/kg" }];
  });
  if (readings.length && new Set(readings.map(row => row.unit)).size === 1) {
    const found = (prefix: string) => readings.filter(row => row.basis.startsWith(prefix));
    const [n, p, k] = [found("N"), found("P"), found("K")];
    if (n.length === 1) draft.nitrogenKgHa = n[0].value;
    if (p.length === 1) { draft.phosphorusKgHa = p[0].value; draft.phosphorusBasis = p[0].basis as "P" | "P2O5"; }
    if (k.length === 1) { draft.potassiumKgHa = k[0].value; draft.potassiumBasis = k[0].basis as "K" | "K2O"; }
    if ([n, p, k].some(rows => rows.length === 1)) draft.nutrientUnit = readings[0].unit;
  }
  return Object.keys(draft).length ? draft : null;
}

export async function scanSoilLocally(bytes: Uint8Array, mediaType: string, settings = soilOcrSettings(undefined, undefined)) {
  const directory = await mkdtemp(join(tmpdir(), "agritrack-scan-"));
  const pdf = mediaType === "application/pdf";
  const file = join(directory, pdf ? "report.pdf" : "report-image");
  const deadline = Date.now() + 19_000;
  const execute = async (command: string, args: string[]) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Scan timed out");
    return (await run(command, args, { timeout: Math.min(remaining, 6500), maxBuffer: 256 * 1024, encoding: "utf8" })).stdout;
  };
  let usedOcr = false;
  let partial = false;
  let fallback = false;
  const extracted: string[] = [];
  try {
    await writeFile(file, bytes, { mode: 0o600 });
    async function recognize(path: string) {
      usedOcr = true;
      if (fallback) return execute("tesseract", [path, "stdout", "-l", "eng"]);
      try { return await execute("tesseract", [path, "stdout", "-l", settings.language]); }
      catch (error) {
        const diagnostic = (error as { stderr?: string }).stderr ?? "";
        if (settings.language === "eng" || !/Error opening data file|Failed loading language/i.test(diagnostic)) throw error;
        fallback = true;
        return execute("tesseract", [path, "stdout", "-l", "eng"]);
      }
    }
    if (!pdf) extracted.push(await recognize(file));
    else {
      const info = await execute("pdfinfo", [file]);
      const pageCount = Number(info.match(/^Pages:\s*(\d+)\s*$/m)?.[1]);
      if (!Number.isSafeInteger(pageCount) || pageCount < 1) return null;
      const limit = Math.min(pageCount, settings.pages);
      partial = limit < pageCount;
      for (let page = 1; page <= limit; page++) {
        try {
          let text = await execute("pdftotext", ["-f", String(page), "-l", String(page), "-layout", file, "-"]);
          if (!text.trim()) {
            const image = join(directory, "page");
            await execute("pdftoppm", ["-f", String(page), "-l", String(page), "-scale-to", "1800", "-singlefile", "-png", file, image]);
            text = await recognize(image + ".png");
          }
          if (text.trim()) extracted.push(`[Page ${page}]\n${text}`);
          else partial = true;
        } catch { partial = true; if (Date.now() >= deadline) break; }
      }
    }
    const fullText = extracted.join("\n").replace(/[\x00-\x08\x0e-\x1f]/g, "").trim();
    const evidence = fullText.slice(0, 12000);
    const source = pdf ? (usedOcr ? "PDF text and OCR" : "PDF text") : "Image OCR";
    return evidence ? { source, evidence, draft: draftFromSoilText(evidence), partial: partial || fullText.length > evidence.length, languageFallback: fallback } : null;
  } catch {
    return null;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
