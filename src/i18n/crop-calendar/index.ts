import catalog from "./translations.json";
import type { CalendarCatalog } from "./format";

const catalogs: Record<string, CalendarCatalog> = catalog;

export function calendarCatalog(locale: string): CalendarCatalog {
  return Object.hasOwn(catalogs, locale) ? catalogs[locale] : {};
}
