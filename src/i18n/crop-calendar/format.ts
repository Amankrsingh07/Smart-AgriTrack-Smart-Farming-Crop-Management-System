import { cropAdviceLabel } from "../crop-advice";

export type CalendarCatalog = Record<string, string>;
const own = (catalog: CalendarCatalog, key: string) => Object.hasOwn(catalog, key) ? catalog[key] : undefined;

export function calendarText(catalog: CalendarCatalog, text: string, values: Record<string, string | number> = {}) {
  return (own(catalog, text) ?? text).replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

export function calendarLabel(catalog: CalendarCatalog, locale: string, text: string) {
  const translated = calendarText(catalog, text);
  return translated === text ? cropAdviceLabel(text, locale) : translated;
}

export function calendarContent(catalog: CalendarCatalog, text: string): string {
  const t = (key: string, values?: Record<string, string>) => calendarText(catalog, key, values);
  const exact = own(catalog, text);
  if (exact) return exact;
  const split = /^(.*?) (Observation reminder only\. .*|Calculated for .*|Expected stage window: .*)$/.exec(text);
  if (split) return `${calendarContent(catalog, split[1])} ${calendarContent(catalog, split[2])}`;
  const sourceProfile = /^(.+) source-reported planning profile$/.exec(text);
  if (sourceProfile) return t("{variety} source-reported planning profile", { variety: t(sourceProfile[1]) });
  const growth = /^(.*) stage$/.exec(text);
  if (growth) return t("{stage} stage", { stage: t(growth[1]) });
  const fertilizer = /^(Fertilizer application|Fertilizer) · (.+)$/.exec(text);
  if (fertilizer) return t(fertilizer[1] + " · {label}", { label: t(fertilizer[2]) });
  const planning = /^Planning estimate based on (.+?) \((\d+) days; source range (.*?) days\)\. (.+)$/.exec(text);
  if (planning) {
    const [, basis, days, range, rest] = planning;
    const basisLabel = calendarContent(catalog, basis);
    const estimate = t("Planning estimate based on {basis} ({days} days; source range {range} days).", { basis: basisLabel, days, range: t(range) });
    return `${estimate} ${calendarContent(catalog, rest)}`;
  }
  const schedule = /^Source schedule: (.+?)\. (Verify with current soil-test and local extension guidance before application\.)$/.exec(text);
  if (schedule) return `${t("Source schedule: {label}.", { label: t(schedule[1]) })} ${t(schedule[2])}`;
  const projected = /^(\d+(?:\.\d+)?) kg (.+)\.$/.exec(text);
  if (projected) return t("{amount} kg {product}.", { amount: projected[1], product: t(projected[2]) });
  const nums: Record<string, string> = {};
  const template = text.replace(/\d+(?:\.\d+)?/g, number => {
    const key = "n" + Object.keys(nums).length;
    nums[key] = number;
    return "{" + key + "}";
  });
  if (own(catalog, template)) return t(template, nums);
  const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/);
  return sentences.length > 1 ? sentences.map(sentence => calendarContent(catalog, sentence)).join(" ") : text;
}
