import { loadEnvConfig } from "@next/env";
import { rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

loadEnvConfig(process.cwd());

const RESOURCE_DEFAULT = "9ef84268-d588-465a-a308-a864a43d0070";
const PAGE_SIZE = 1000;
const MAX_RECORDS = 100_000;
const SOURCE_URL = "https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi";
const outputPath = resolve(process.cwd(), "src/data/mandi-prices.json");
const tempPath = `${outputPath}.tmp`;

type ApiRecord = {
  state?: string; district?: string; market?: string; commodity?: string; variety?: string; grade?: string;
  arrival_date?: string; min_price?: string | number; max_price?: string | number; modal_price?: string | number;
};
type ApiPage = { records?: ApiRecord[]; total?: string | number; count?: string | number; message?: string; error?: string };

function price(value: string | number | undefined) {
  if (value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : String(value);
}

function arrivalDate(value: string | undefined) {
  if (!value) return "";
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value.trim();
}

async function main() {
  let apiKey = process.env.DATA_GOV_IN_API_KEY?.trim();
  const resourceId = process.env.DATA_GOV_IN_RESOURCE_ID?.trim() || RESOURCE_DEFAULT;
  if (!/^[\da-f-]{36}$/i.test(resourceId)) throw new Error("DATA_GOV_IN_RESOURCE_ID must be a valid resource UUID.");
  if (!apiKey) {
    const page = await fetch(SOURCE_URL, { headers: { accept: "text/html" }, cache: "no-store", signal: AbortSignal.timeout(25_000) });
    if (!page.ok) throw new Error(`Could not read the official data.gov.in dataset page (HTTP ${page.status}); existing snapshot was not changed.`);
    const html = await page.text();
    const embeddedUrl = /field_datafile_url:\\?"([^\"]+)\\?"/.exec(html)?.[1]
      ?.replaceAll("\\u002F", "/").replaceAll("&amp;", "&");
    if (!embeddedUrl) throw new Error("The official dataset page did not expose its public API URL; set DATA_GOV_IN_API_KEY to refresh the snapshot.");
    const publishedApiUrl = new URL(embeddedUrl);
    if (publishedApiUrl.origin !== "https://api.data.gov.in" || publishedApiUrl.pathname !== `/resource/${resourceId}`) {
      throw new Error("The official page API URL did not match the configured mandi resource; existing snapshot was not changed.");
    }
    apiKey = publishedApiUrl.searchParams.get("api-key")?.trim();
    if (!apiKey) throw new Error("No public API key was listed on the official page; set DATA_GOV_IN_API_KEY to refresh the snapshot.");
  }

  const records: NonNullable<ApiPage["records"]> = [];
  let total: number | undefined;
  for (let offset = 0; offset < (total ?? MAX_RECORDS); offset += PAGE_SIZE) {
    const url = new URL(`https://api.data.gov.in/resource/${resourceId}`);
    url.searchParams.set("api-key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`data.gov.in returned HTTP ${response.status}; the existing offline snapshot was not changed.`);
    const page = await response.json() as ApiPage;
    if (!Array.isArray(page.records)) throw new Error(page.message || page.error || "data.gov.in response did not contain records; existing snapshot was not changed.");
    const pageTotal = Number(page.total);
    if (!Number.isFinite(pageTotal) || pageTotal < 0 || pageTotal > MAX_RECORDS) throw new Error("data.gov.in returned an invalid or unexpectedly large record count.");
    total ??= pageTotal;
    if (!page.records.length && records.length < total) throw new Error("data.gov.in pagination stopped early; existing snapshot was not changed.");
    records.push(...page.records);
    console.log(`Downloaded ${records.length.toLocaleString("en-IN")} / ${total.toLocaleString("en-IN")} mandi records`);
    if (records.length >= total) break;
  }

  if (!records.length) throw new Error("data.gov.in returned no mandi records; existing snapshot was not changed.");
  const normalized = records.map(row => ({
    State: row.state ?? "", District: row.district ?? "", Market: row.market ?? "", Commodity: row.commodity ?? "",
    Variety: row.variety ?? "", Grade: row.grade ?? "", Arrival_Date: arrivalDate(row.arrival_date),
    Min_Price: price(row.min_price), Max_Price: price(row.max_price), Modal_Price: price(row.modal_price),
  }));
  const latestDate = normalized.map(row => row.Arrival_Date).filter(Boolean).sort((a, b) => {
    const toIso = (date: string) => { const [day, month, year] = date.split("/"); return `${year}-${month}-${day}`; };
    return toIso(a).localeCompare(toIso(b));
  }).at(-1);
  const downloadedAt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const snapshot = {
    meta: {
      title: "Current Daily Price of Various Commodities from Various Markets (Mandi)",
      source: "Open Government Data Platform India (data.gov.in), Ministry of Agriculture and Farmers Welfare / Directorate of Marketing and Inspection",
      resourceId, downloadedAt, dataDate: latestDate || "Not available", license: "Government Open Data License - India", sourceUrl: SOURCE_URL,
      recordCount: normalized.length,
    },
    records: normalized,
  };

  await writeFile(tempPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  await rename(tempPath, outputPath);
  console.log(`Updated offline mandi snapshot: ${normalized.length.toLocaleString("en-IN")} records, latest arrival date ${latestDate || "Not available"}.`);
}

main().catch(async error => {
  const { unlink } = await import("node:fs/promises");
  await unlink(tempPath).catch(() => undefined);
  console.error(error instanceof Error ? error.message : "Offline mandi snapshot update failed.");
  process.exitCode = 1;
});
