import { farmerTerm } from "../farmer-terms";
import { storageMessage } from "./storage-messages";
import english from "./en.json";
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templates = (english as string[])
  .filter(
    (s) =>
      /\{v\d+\}/.test(s) &&
      s.replace(/\{v\d+\}/g, "").replace(/[^A-Za-z]/g, "").length >= 8,
  )
  .sort((a, b) => b.length - a.length)
  .map((s) => ({
    source: s,
    keys: [...s.matchAll(/\{v\d+\}/g)].map((m) => m[0]),
    pattern: new RegExp(
      `^${s
        .split(/\{v\d+\}/)
        .map(escape)
        .join("([\\s\\S]*?)")}$`,
    ),
  }));
export function translateProtection(
  locale: string,
  catalog: Record<string, string> | undefined,
  value: string,
  depth = 0,
): string {
  if (
    locale === "en" ||
    !catalog ||
    !value.trim() ||
    /^https?:/.test(value.trim()) ||
    depth > 3
  )
    return value;
  const key = normalize(value),
    exact =
      farmerTerm(locale, key) ??
      storageMessage(locale, key) ??
      (key === "High concern" ? catalog["Serious concern"] : undefined) ??
      catalog[key] ??
      catalog[key.replaceAll("&", "&amp;")];
  let translated = exact;
  if (!translated)
    for (const t of templates) {
      const target = catalog[t.source],
        match = target && t.pattern.exec(key);
      if (!target || !match) continue;
      translated = target;
      t.keys.forEach((token, i) => {
        translated = translated!.replaceAll(
          token,
          translateProtection(locale, catalog, match[i + 1], depth + 1),
        );
      });
      break;
    }
  // Joined rule/status lines are authored pieces; translate each exact segment.
  if (!translated && /[·;\n]/.test(value)) {
    const parts = value.split(/([·;\n])/);
    const changed = parts.map((s) =>
      translateProtection(locale, catalog, s, depth + 1),
    );
    if (changed.some((s, i) => s !== parts[i])) return changed.join("");
  }
  if (!translated && value.includes(", ")) {
    const items = value.split(", ");
    const localized = items.map((item) =>
      translateProtection(locale, catalog, item, depth + 1),
    );
    if (localized.every((item, index) => item !== items[index]))
      return localized.join(", ");
  }
  return translated
    ? `${value.match(/^\s*/)?.[0] ?? ""}${translated}${value.match(/\s*$/)?.[0] ?? ""}`
    : value;
}
