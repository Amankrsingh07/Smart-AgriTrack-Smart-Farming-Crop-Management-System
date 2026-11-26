import { productRestrictionReview } from "./crop-protection-products";
import { indiaDateKey } from "./crop-cycle-status";
import { z } from "zod";
const optionalDate = z
  .union([
    z.literal(""),
    z.iso
      .date()
      .refine(
        (v) => v <= indiaDateKey(new Date()),
        "Application date cannot be in the future.",
      ),
  ])
  .default("");
const short = z.string().trim().max(200).default("");
export const applicationSchema = z.object({
  kind: z.enum(["Fertilizer", "Pesticide", "Herbicide", "Fungicide"]),
  product: z.string().trim().min(1).max(200),
  activeIngredient: z.string().trim().max(200).optional(),
  formulation: short,
  quantity: z.number().finite().positive().optional(),
  quantityUnit: z.enum(["kg", "g", "L", "mL"]).default("kg"),
  area: z.number().finite().positive().optional(),
  areaUnit: z.enum(["ha", "acre"]).default("acre"),
  date: optionalDate,
  method: short,
  dose: z.number().finite().positive().optional(),
  labelDose: z.number().finite().positive().optional(),
  doseUnit: z
    .enum(["kg/ha", "kg/acre", "g/L", "mL/L", "L/ha", "mL/acre"])
    .default("kg/ha"),
  labelReference: short,
  labelApplicable: z.boolean().default(false),
  mixing: short,
  weather: short,
  distribution: z.enum(["Unknown", "Even", "Uneven"]).default("Unknown"),
});
export type ProtectionApplication = z.infer<typeof applicationSchema>;
export function assessApplications(
  applications: ProtectionApplication[],
  crop = "",
) {
  return applications.map((a) => {
    const normalizedDose =
      a.quantity !== undefined && a.area !== undefined
        ? Number((a.quantity / a.area).toFixed(4))
        : null;
    const comparable =
      a.dose !== undefined &&
      a.labelDose !== undefined &&
      a.labelApplicable &&
      !!a.labelReference;
    const comparison = !comparable
      ? "Not compared: provide applied and label doses in the same unit, label reference and crop/stage applicability."
      : a.dose! > a.labelDose!
        ? "Reported applied dose exceeds the farmer-entered label dose; qualified label review required. This does not establish injury."
        : "Reported applied dose does not exceed the farmer-entered label dose. This does not rule out injury or validate the application.";
    return {
      regulatory: productRestrictionReview(a.activeIngredient ?? "", crop),
      product: a.product,
      kind: a.kind,
      normalizedDose,
      normalizedUnit: `${a.quantityUnit}/${a.areaUnit}`,
      comparison,
      reviewRequired:
        !!(comparable && a.dose! > a.labelDose!) ||
        !!a.mixing ||
        a.distribution === "Uneven",
      evidence: [
        ...(a.date ? [`Application date: ${a.date}`] : []),
        ...(a.distribution === "Uneven"
          ? ["Farmer reports uneven distribution"]
          : []),
        ...(a.mixing
          ? ["Tank mixing reported; compatibility not verified"]
          : []),
        ...(a.weather
          ? [`Farmer-reported application weather: ${a.weather}`]
          : []),
      ],
      missing: [
        ...(!a.formulation ? ["Exact formulation"] : []),
        ...(!a.date ? ["Application date"] : []),
        ...(!a.method ? ["Application method"] : []),
        ...(!a.labelApplicable || !a.labelReference
          ? ["Registered label and crop/growth-stage applicability"]
          : []),
      ],
      limitation:
        "Farmer-entered quantities and label details are unverified. No automatic product approval, mixing recommendation or treatment dose is generated.",
    };
  });
}
