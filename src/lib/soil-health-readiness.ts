import { canConvertNutrientBasis } from "./nutrient-basis";
import { soilNutrients, soilNutrientReading } from "./soil-nutrient-reading";
import { isDemoSoilSample } from "./soil-sample-mode";
import type { SoilHealthInput } from "./soil-health";
import {
  availableSoilStandards,
  canonicalSoilMethod,
  canonicalSoilPhMethod,
} from "./soil-reference-matching";

/** Suggest a publication only. This never supplies laboratory evidence or confirms applicability. */
export function suggestSoilReference(state: string, current = "UNKNOWN") {
  const references = availableSoilStandards(state);
  if (references.some((reference) => reference.id === current)) return current;
  const enabled = references.filter(
    (reference) => reference.classificationEnabled,
  );
  return enabled.length === 1 ? enabled[0].id : "UNKNOWN";
}
export type SoilReadinessItem = { key: string; message: string };
export function soilReadiness(
  input: Partial<SoilHealthInput>,
): SoilReadinessItem[] {
  const demo = isDemoSoilSample(input);
  const items: SoilReadinessItem[] = [];
  const add = (key: string, message: string) => items.push({ key, message });
  const measured = (
    key:
      | "nitrogen"
      | "phosphorus"
      | "potassium"
      | "organicCarbonPercent"
      | "soilPh",
  ) => {
    const value =
      key === "organicCarbonPercent" || key === "soilPh"
        ? input[key]
        : soilNutrientReading(input, key).value;
    return typeof value === "number" && Number.isFinite(value);
  };
  const hasNpk = soilNutrients.some(measured);
  const hasNutrients = hasNpk || measured("organicCarbonPercent");
  if (!hasNutrients && !measured("soilPh"))
    add(
      "readings",
      "Lab report se kam se kam ek measured reading bharein. Missing reading ko zero na bharein.",
    );
  if (
    !demo &&
    (hasNutrients || measured("soilPh")) &&
    !input.laboratoryName?.trim()
  )
    add("laboratoryName", "Issuing laboratory ka naam lab report se bharein.");
  if (hasNutrients || measured("soilPh")) {
    const references = availableSoilStandards(input.state ?? "");
    const selected = references.find(
      (reference) => reference.id === input.referenceStandardId,
    );
    if (!selected)
      add(
        "referenceStandardId",
        references.some((reference) => reference.classificationEnabled)
          ? "Apne state ka available interpretation reference select karein. Reference suggest karna lab confirmation nahi hai."
          : "Is region ke liye compatible interpretation reference available nahi hai; nutrient status Unknown rahega.",
      );
    else if (!selected.classificationEnabled)
      add(
        "referenceStandardId",
        "Selected publication ki method mapping verified nahi hai; isse naye nutrient classes assign nahi honge.",
      );
    else if (!demo && !input.labReferenceConfirmed)
      add(
        "labReferenceConfirmed",
        "Issuing lab se applicability confirm hone par hi confirmation checkbox tick karein.",
      );
  }
  if (
    soilNutrients.some(
      (nutrient) =>
        measured(nutrient) &&
        soilNutrientReading(input, nutrient).unit === "UNKNOWN",
    )
  )
    add(
      "nutrientUnit",
      "Select the unit printed next to each measured nutrient on the report.",
    );
  if (
    measured("phosphorus") &&
    (!input.phosphorusBasis || input.phosphorusBasis === "UNKNOWN")
  )
    add(
      "phosphorusBasis",
      "Report mein phosphorus P hai ya P₂O₅, yeh select karein; dono ek nahi hain.",
    );
  if (
    measured("potassium") &&
    (!input.potassiumBasis || input.potassiumBasis === "UNKNOWN")
  )
    add(
      "potassiumBasis",
      "Report mein potassium K hai ya K₂O, yeh select karein; dono ek nahi hain.",
    );
  for (const [reading, method, name] of [
    ["nitrogen", "nitrogenMethod", "Nitrogen"],
    ["phosphorus", "phosphorusMethod", "Phosphorus"],
    ["potassium", "potassiumMethod", "Potassium"],
    ["organicCarbonPercent", "organicCarbonMethod", "Organic carbon"],
  ] as const) {
    if (measured(reading) && !canonicalSoilMethod(input[method]))
      add(
        method,
        `${name} ka exact test method lab report se bharein. Unknown/unsupported method ko automatically replace nahi kiya jayega.`,
      );
  }
  if (measured("soilPh") && !canonicalSoilPhMethod(input.phMethod))
    add(
      "phMethod",
      "pH measurement method missing ya incompatible hai. Sirf report mein soil:water 1:2.5 ho tabhi woh option select karein.",
    );
  const reference = availableSoilStandards(input.state ?? "").find(
    (item) => item.id === input.referenceStandardId,
  );
  for (const [reading, parameter, methodKey, basis, title] of [
    ["nitrogen", "nitrogen", "nitrogenMethod", "N", "Nitrogen"],
    [
      "phosphorus",
      "phosphorus",
      "phosphorusMethod",
      input.phosphorusBasis,
      "Phosphorus",
    ],
    [
      "potassium",
      "potassium",
      "potassiumMethod",
      input.potassiumBasis,
      "Potassium",
    ],
  ] as const) {
    const rule = reference?.rules.find(
      (item) =>
        item.parameter === parameter &&
        item.classificationEnabled &&
        item.methods.includes(canonicalSoilMethod(input[methodKey]) ?? ""),
    );
    if (!measured(reading)) continue;
    if (!rule) {
      const recorded = canonicalSoilMethod(input[methodKey]);
      if (reference?.classificationEnabled && recorded)
        add(
          `${parameter}MethodMismatch`,
          `The selected reference has no validated ${title} rule for ${recorded}.`,
        );
      continue;
    }
    if (
      basis &&
      basis !== "UNKNOWN" &&
      basis !== rule.basis &&
      !(rule.allowBasisConversion && canConvertNutrientBasis(basis, rule.basis))
    )
      add(
        `${parameter}BasisMismatch`,
        `${title} ka recorded basis ${basis} hai; reference ${rule.basis} par hai. Basis badlein nahi; compatible lab interpretation chahiye.`,
      );
    const { unit } = soilNutrientReading(input, parameter);
    if (
      unit !== "UNKNOWN" &&
      unit !== rule.unit &&
      !(unit === "kg/acre" && rule.unit === "kg/ha")
    )
      add(
        `${parameter}UnitMismatch`,
        `${title} ki unit ${unit} reference ${rule.unit} se compatible nahi hai. Unit assume/convert nahi ki jayegi.`,
      );
  }
  const pRule = reference?.rules.find(
    (rule) =>
      rule.parameter === "phosphorus" &&
      rule.classificationEnabled &&
      rule.methods.includes(canonicalSoilMethod(input.phosphorusMethod) ?? ""),
  );
  if (
    measured("phosphorus") &&
    pRule?.requiresAlkalineWaterPh &&
    !(
      measured("soilPh") &&
      input.soilPh! > 7 &&
      canonicalSoilPhMethod(input.phMethod) === "WATER_1_2_5"
    )
  )
    add(
      "phosphorusCondition",
      `Current Olsen P reference alkaline soil ke liye hai${measured("soilPh") ? `; aapka recorded pH ${input.soilPh} hai` : "; pH evidence missing hai"}. Reading badlein nahi: appropriate lab interpretation milne tak P Unknown rahega.`,
    );
  return items;
}
