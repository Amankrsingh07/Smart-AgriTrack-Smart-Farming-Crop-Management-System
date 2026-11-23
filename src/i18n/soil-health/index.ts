import translations from "./translations.json";
import { translateSoil } from "./translate";
export { soilDateLabel } from "./translate";

export function soilCatalog(locale: string): Record<string, string> | undefined {
  return (translations as Record<string, Record<string, string>>)[locale];
}

export function soilText(locale: string, value: string, depth = 0): string {
  return translateSoil(locale, soilCatalog(locale), value, depth);
}
