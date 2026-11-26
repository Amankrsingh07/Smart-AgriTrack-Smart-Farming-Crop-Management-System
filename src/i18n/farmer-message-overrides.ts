import { farmerTerm } from "./farmer-terms";
import type { LanguageCode } from "./languages";
import { soilCatalog } from "./soil-health";
import { workspaceCatalog } from "./crop-protection";

type Messages = Record<string, string>;

// Only application-authored, exact matches are reused. Equal placeholders are
// required so locale changes never drop a quantity or value supplied by a caller.
export function farmerMessageOverrides(
  locale: LanguageCode,
  local: Messages,
  english: Messages,
  inheritedEnglish: boolean,
) {
  const soil = soilCatalog(locale);
  const protection = workspaceCatalog(locale);
  const placeholders = (text: string) =>
    [...text.matchAll(/\{\s*([A-Za-z_]\w*)\s*\}/g)]
      .map((match) => match[1])
      .sort()
      .join(",");
  return Object.fromEntries(
    Object.entries(english).map(([key, source]) => {
      const term =
        inheritedEnglish || key === "profitLoss" || key === "growthStage"
          ? farmerTerm(locale, source)
          : undefined;
      const value = local[key] ?? source;
      const candidate =
        term ??
        (inheritedEnglish && value === source
          ? (soil?.[source] ?? protection[source])
          : undefined);
      return [
        key,
        candidate && placeholders(candidate) === placeholders(source)
          ? candidate
          : value,
      ];
    }),
  );
}
