import hi from "./catalogs/hi.json";
import pa from "./catalogs/pa.json";
import mr from "./catalogs/mr.json";
import gu from "./catalogs/gu.json";
import bn from "./catalogs/bn.json";
import ta from "./catalogs/ta.json";
import te from "./catalogs/te.json";
import kn from "./catalogs/kn.json";
import ml from "./catalogs/ml.json";
import or from "./catalogs/or.json";
import english from "./en.json";
const catalogs: Record<string, Record<string, string>> = {
  hi,
  pa,
  mr,
  gu,
  bn,
  ta,
  te,
  kn,
  ml,
  or,
};
import { translateProtection } from "./translate";
export function protectionText(locale: string, value: string, depth = 0) {
  return translateProtection(locale, catalogs[locale], value, depth);
}
export function protectionLanguageNotice(locale: string) {
  // Normal UI has bundled translations. Legacy/unrecognized farmer records remain verbatim.
  return catalogs[locale] || locale === "en"
    ? null
    : "English fallback: this language is not supported.";
}
export function workspaceCatalog(locale: string) {
  return locale === "en"
    ? Object.fromEntries((english as string[]).map((s) => [s, s]))
    : (catalogs[locale] ?? {});
}
