import { farmerTerm } from "../farmer-terms";
import source from "./en.json";
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templates = (source as string[]).filter(text => /\{[a-zA-Z]\w*\}/.test(text) && text.replace(/\{[a-zA-Z]\w*\}/g, "").replace(/[^A-Za-z]/g, "").length >= 12).sort((a,b) => b.replace(/\{[a-zA-Z]\w*\}/g, "").length - a.replace(/\{[a-zA-Z]\w*\}/g, "").length).map(text => ({ text, keys: text.match(/\{[a-zA-Z]\w*\}/g)!, pattern: new RegExp(`^${text.split(/\{[a-zA-Z]\w*\}/).map(escape).join("([\\s\\S]*?)")}$`) }));
/** Read-only rendering: raw laboratory metadata and stored analysis never change. */
export function translateSoil(locale: string, catalog: Record<string,string> | undefined, value: string, depth = 0): string {
  if (["DEMO DATA", "kg/ha", "kg/acre", "mg/kg", "N", "P", "K", "P2O5", "K2O", "OC"].includes(value.trim())) return value;
  if (locale === "en" || !catalog || depth > 4 || !value.trim() || /^https?:/.test(value)) return value;
  const trimmed = value.trim().replace(/\s+/g, " "); const exact = farmerTerm(locale, trimmed) ?? catalog[trimmed];
  if (exact) return value.match(/^\s*/)?.[0] + exact + value.match(/\s*$/)?.[0];
  for (const item of templates) {
    const match = item.pattern.exec(trimmed); const target = catalog[item.text];
    if (!match || !target) continue;
    let result = target;
    item.keys.forEach((key,index) => { result = result.replaceAll(key, translateSoil(locale, catalog, match[index+1], depth+1)); });
    return (value.match(/^\s*/)?.[0] ?? "") + result + (value.match(/\s*$/)?.[0] ?? "");
  }
  // Legacy snapshots stay verbatim if their wording has no known translation.
  return value;
}

/** Legacy sample dates are display-only: do not normalize an invalid saved date. */
export function soilDateLabel(locale: string, value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return value;
  return date.toLocaleDateString(locale, { timeZone: "UTC", dateStyle: "medium" });
}
