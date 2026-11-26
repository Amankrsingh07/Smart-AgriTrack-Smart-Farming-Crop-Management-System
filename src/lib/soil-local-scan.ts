import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { soilOcrSettings } from "./soil-ocr-settings";
import { canonicalSoilPhMethod } from "./soil-reference-matching";
import type { SoilExtractionDraft } from "./soil-report-extraction";

const run = promisify(execFile);

export function draftFromSoilText(text: string): SoilExtractionDraft | null {
  const lines = text.split(/\r?\n/);
  const headers = {
    laboratoryName: "Laboratory(?: name)?",
    reportNumber: "Report (?:number|no\\.?)",
    sampleDate: "Sampling date",
    reportDate: "Report date",
    nitrogenMethod: "(?:Available )?(?:Nitrogen|N) (?:test )?method",
    phosphorusMethod: "(?:Available )?(?:Phosphorus|P) (?:test )?method",
    potassiumMethod: "(?:Available )?(?:Potassium|K) (?:test )?method",
    organicCarbonMethod: "Organic carbon method",
  } as const;
  const draft: SoilExtractionDraft = {};
  for (const [key, label] of Object.entries(headers) as [
    keyof typeof headers,
    string,
  ][]) {
    const matches = lines.flatMap(
      (line) =>
        line.match(
          new RegExp(`^\\s*${label}\\s*:\\s*(.{1,100}?)\\s*$`, "i"),
        )?.[1] ?? [],
    );
    if (
      matches.length === 1 &&
      (!key.endsWith("Date") || /^\d{4}-\d{2}-\d{2}$/.test(matches[0]))
    )
      draft[key] = matches[0];
  }
  const phValues = lines.flatMap((line) => {
    const match = /^\s*(?:Soil )?pH\s*:\s*(\d+(?:\.\d+)?)\s*$/i.exec(line);
    return match && Number(match[1]) <= 14 ? [Number(match[1])] : [];
  });
  const phMethods = lines.flatMap((line) =>
    line.match(/^\s*(?:Soil )?pH (?:test )?method\s*:\s*(.+)$/i)?.[1] ?? [],
  );
  if (phValues.length === 1) {
    draft.soilPh = phValues[0];
    if (phMethods.length === 1)
      draft.phMethod = canonicalSoilPhMethod(phMethods[0]) ?? "OTHER";
  }
  const readings = lines.flatMap((line) => {
    const match = line
      .replaceAll("₂", "2")
      .replaceAll("₅", "5")
      .match(
        /^\s*(?:Available\s+)?(Nitrogen|Phosphorus|Potassium|N|P2O5|P|K2O|K)(?:\s*\(\s*(?:as\s+)?(N|P2O5|P|K2O|K)\s*\))?\s*:\s*(\d+(?:\.\d+)?)\s*(kg\s*\/\s*ha|kg\s*\/\s*acre|mg\s*\/\s*kg|ppm)(?:\s+as\s+(N|P2O5|P|K2O|K))?\s*$/i,
      );
    if (!match || Number(match[3]) > 100000) return [];
    const label = match[1].toUpperCase();
    const nutrient = label === "POTASSIUM" ? "K" : label[0];
    const prefixBasis = match[2]?.toUpperCase();
    const suffixBasis = match[5]?.toUpperCase();
    if (prefixBasis && suffixBasis && prefixBasis !== suffixBasis) return [];
    const explicitBasis = prefixBasis ?? suffixBasis;
    const symbolicLabel = /^(N|P2O5|P|K2O|K)$/.test(label);
    if (
      explicitBasis &&
      (explicitBasis[0] !== nutrient || (symbolicLabel && explicitBasis !== label))
    )
      return [];
    return [
      {
        nutrient,
        basis: explicitBasis ?? (symbolicLabel ? label : undefined),
        value: Number(match[3]),
        unit: match[4].toLowerCase().replace(/\s/g, "") as
          | "kg/ha"
          | "kg/acre"
          | "mg/kg"
          | "ppm",
      },
    ];
  });
  if (readings.length) {
    const found = (prefix: string) =>
      readings.filter((row) => row.nutrient === prefix);
    const [n, p, k] = [found("N"), found("P"), found("K")];
    if (n.length === 1) draft.nitrogenKgHa = n[0].value;
    if (p.length === 1) {
      draft.phosphorusKgHa = p[0].value;
      if (p[0].basis === "P" || p[0].basis === "P2O5")
        draft.phosphorusBasis = p[0].basis;
    }
    if (k.length === 1) {
      draft.potassiumKgHa = k[0].value;
      if (k[0].basis === "K" || k[0].basis === "K2O")
        draft.potassiumBasis = k[0].basis;
    }
    if (new Set(readings.map((row) => row.unit)).size === 1) {
      if ([n, p, k].some((rows) => rows.length === 1))
        draft.nutrientUnit = readings[0].unit;
    } else {
      if (n.length === 1) draft.nitrogenUnit = n[0].unit;
      if (p.length === 1) draft.phosphorusUnit = p[0].unit;
      if (k.length === 1) draft.potassiumUnit = k[0].unit;
    }
  }
  return Object.keys(draft).length ? draft : null;
}

export async function scanSoilLocally(
  bytes: Uint8Array,
  mediaType: string,
  settings = soilOcrSettings(undefined, undefined),
) {
  const directory = await mkdtemp(join(tmpdir(), "agritrack-scan-"));
  const pdf = mediaType === "application/pdf";
  const file = join(directory, pdf ? "report.pdf" : "report-image");
  const deadline = Date.now() + 19_000;
  const execute = async (command: string, args: string[]) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Scan timed out");
    return (
      await run(command, args, {
        timeout: Math.min(remaining, 6500),
        maxBuffer: 256 * 1024,
        encoding: "utf8",
      })
    ).stdout;
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
      try {
        return await execute("tesseract", [
          path,
          "stdout",
          "-l",
          settings.language,
        ]);
      } catch (error) {
        const diagnostic = (error as { stderr?: string }).stderr ?? "";
        if (
          settings.language === "eng" ||
          !/Error opening data file|Failed loading language/i.test(diagnostic)
        )
          throw error;
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
          let text = await execute("pdftotext", [
            "-f",
            String(page),
            "-l",
            String(page),
            "-layout",
            file,
            "-",
          ]);
          if (!text.trim()) {
            const image = join(directory, "page");
            await execute("pdftoppm", [
              "-f",
              String(page),
              "-l",
              String(page),
              "-scale-to",
              "1800",
              "-singlefile",
              "-png",
              file,
              image,
            ]);
            text = await recognize(image + ".png");
          }
          if (text.trim()) extracted.push(`[Page ${page}]\n${text}`);
          else partial = true;
        } catch {
          partial = true;
          if (Date.now() >= deadline) break;
        }
      }
    }
    const fullText = extracted
      .join("\n")
      .replace(/[\x00-\x08\x0e-\x1f]/g, "")
      .trim();
    const evidence = fullText.slice(0, 12000);
    const source = pdf
      ? usedOcr
        ? "PDF text and OCR"
        : "PDF text"
      : "Image OCR";
    return evidence
      ? {
          source,
          evidence,
          draft: draftFromSoilText(evidence),
          partial: partial || fullText.length > evidence.length,
          languageFallback: fallback,
        }
      : null;
  } catch {
    return null;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
