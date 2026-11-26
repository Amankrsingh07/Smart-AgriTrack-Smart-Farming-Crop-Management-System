import { cropAdviceText, cropAdviceLabel } from "@/i18n/crop-advice";
import reference from "@/data/crop-soil-advice.json";

export const soilKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
export type SoilAdviceInput = {
  crop: string;
  soil: string;
  state: string;
  district: string;
  ph: number | null;
  texture: string | null;
};
export function savedCropSoilAdvice(input: SoilAdviceInput, locale = "en") {
  const t = (text: string, values?: Record<string, string | number>) =>
    cropAdviceText(text, locale, values);
  const profile = reference.profiles.find((item) =>
    item.names.some((name) => soilKey(name) === soilKey(input.crop)),
  );
  const phRange = profile?.ph ?? null;
  const phMessage =
    input.ph === null
      ? t(
          "Field pH is not recorded. Add a laboratory result in Farms / Fields.",
        )
      : phRange
        ? input.ph < phRange[0] || input.ph > phRange[1]
          ? t(
              "Recorded pH {ph} is outside the reference optimum {min}–{max}. Ask the soil lab to interpret suitability before any amendment.",
              { ph: input.ph, min: phRange[0], max: phRange[1] },
            )
          : t("Recorded pH {ph} is within the reference optimum {min}–{max}.", {
              ph: input.ph,
              min: phRange[0],
              max: phRange[1],
            })
        : t(
            "Recorded field pH: {ph}. No source-backed optimum range is configured for this crop; ask the soil lab to interpret it.",
            { ph: input.ph },
          );
  const regional = soilKey(input.state) === "bihar" ? reference.bihar : null;
  return {
    version: reference.version,
    summary: t(
      profile?.summary ??
        "A crop-specific reference is not yet available. Use the stored soil requirements below and a crop-specific soil report.",
    ),
    texture: `${input.texture ? t("Recorded field texture: {texture}.", { texture: cropAdviceLabel(input.texture, locale) }) : t("Field texture is not recorded.")} ${t(profile?.texture ?? "Confirm texture, structure and drainage with a field assessment.")}`,
    drainage: t(
      profile?.drainage ??
        "Inspect field drainage and standing water; get a crop-specific drainage plan from the local KVK.",
    ),
    phRange,
    phMessage,
    regional: regional
      ? t(regional.note)
      : t(
          "No regional soil advisory is bundled for {district}, {state}. General crop guidance does not establish local suitability.",
          {
            district: cropAdviceLabel(input.district, locale),
            state: cropAdviceLabel(input.state, locale),
          },
        ),
    testing: t(reference.soilTest.note),
    nutrientPlan: t(
      "Use measured soil nutrients and a crop-specific Soil Health Card to choose N, P and K inputs. Soil type and acreage alone cannot determine a fertilizer dose. Review organic carbon before planning compost or manure inputs.",
    ),
    scope: t(
      profile?.scope ??
        "General soil assessment only; crop-specific data is missing.",
    ),
    sources: [
      ...(profile ? [{ title: profile.source, url: profile.url }] : []),
      ...(regional ? [{ title: regional.source, url: regional.url }] : []),
      { title: reference.soilTest.source, url: reference.soilTest.url },
    ],
  };
}
export type SavedSoilAdvice = ReturnType<typeof savedCropSoilAdvice>;

/** Compare like-for-like water references; retain different irrigation methods and study locations. */
export function uniqueWaterReferences<
  T extends {
    period: string;
    measure: string;
    valueMm: string;
    sourceUrl?: string;
    method: string | null;
    scope: string | null;
  },
>(values: T[]): T[] {
  const unique = new Map<string, T>();
  for (const value of values) {
    const key = JSON.stringify([
      value.period,
      value.measure,
      value.valueMm,
      value.sourceUrl,
      value.method,
      value.scope,
    ]);
    unique.set(key, value);
  }
  const rows = [...unique.values()];
  return rows.filter((value) => {
    if (value.method || value.scope || !value.sourceUrl) return true;
    // Older rows may lack method/scope. Suppress only when exactly one fully
    // attributed row from the same publication has the same period and quantity.
    const replacements = rows.filter(
      (other) =>
        other !== value &&
        other.method &&
        other.scope &&
        other.sourceUrl === value.sourceUrl &&
        other.period === value.period &&
        other.measure === value.measure &&
        other.valueMm === value.valueMm,
    );
    return replacements.length !== 1;
  });
}
