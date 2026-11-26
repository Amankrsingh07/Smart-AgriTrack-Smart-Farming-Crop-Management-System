export const soilOcrLanguages = {
  en: "eng",
  hi: "hin",
  pa: "pan",
  mr: "mar",
  gu: "guj",
  bn: "ben",
  ta: "tam",
  te: "tel",
  kn: "kan",
  ml: "mal",
  or: "ori",
} as const;
export const maxSoilScanPages = 12;
export function soilOcrSettings(pages: unknown, locale: unknown) {
  const size =
    typeof pages === "string" && /^\d{1,2}$/.test(pages) ? Number(pages) : 4;
  return {
    pages: Math.max(1, Math.min(maxSoilScanPages, size)),
    language:
      typeof locale === "string" && Object.hasOwn(soilOcrLanguages, locale)
        ? soilOcrLanguages[locale as keyof typeof soilOcrLanguages]
        : "eng",
  };
}
