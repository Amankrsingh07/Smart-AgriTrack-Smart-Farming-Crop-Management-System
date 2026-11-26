import { nutritionSampleSchema } from "./nutrition-evidence";
import { supplementalSoilAnalytes } from "./soil-supplemental-readings";
import { soilDemoFixtures } from "./soil-demo";
import {
  canonicalSoilPhMethod,
  soilStandards,
} from "./soil-reference-matching";
import { z } from "zod";
import { cropGrowthStages } from "./crop-growth-stages";
import { indiaDateKey } from "./crop-cycle-status";

const reading = z.number().finite().min(0).max(100_000).optional();
const method = z.string().trim().max(120).default("");
const unit = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value.trim().toLowerCase() === "unknown"
        ? "UNKNOWN"
        : value
            .trim()
            .toLowerCase()
            .replace(/\s*\/\s*/g, "/")
      : value,
  z.enum(["kg/ha", "kg/acre", "mg/kg", "ppm", "UNKNOWN"]),
);
const basis = (value: unknown) =>
  typeof value === "string"
    ? value.trim().toUpperCase().replaceAll("₂", "2").replaceAll("₅", "5")
    : value;
const id = z.string().trim().min(1).max(191).optional();
export const soilHealthSchema = z
  .object({
    mode: z.enum(["REAL", "DEMO"]).default("REAL"),
    synthetic: z.boolean().optional(),
    dataLabel: z.enum(["DEMO DATA", "REAL LABORATORY MODE"]).optional(),
    demoFixtureId: z
      .enum(soilDemoFixtures.map((item) => item.id) as [string, ...string[]])
      .optional(),
    state: z.string().trim().min(2).max(80),
    district: z.string().trim().min(2).max(100),
    crop: z.string().trim().min(2).max(80),
    growthStage: z.enum(cropGrowthStages),
    soilType: z.string().trim().min(2).max(60),
    nitrogenKgHa: reading,
    phosphorusKgHa: reading,
    potassiumKgHa: reading,
    nitrogenValue: reading,
    phosphorusValue: reading,
    potassiumValue: reading,
    soilPh: z.number().finite().min(0).max(14).optional(),
    organicCarbonPercent: z.number().finite().min(0).max(100).optional(),
    scannerEvidence: z
      .object({
        source: z.enum([
          "PDF text",
          "Image OCR",
          "Scanned PDF OCR (page 1)",
          "PDF text and OCR",
        ]),
        evidence: z.string().trim().min(1).max(12000),
      })
      .optional(),
    nutritionSamples: z.array(nutritionSampleSchema).max(12).optional(),
    supplementalReadings: z
      .array(
        z.object({
          analyte: z.enum(supplementalSoilAnalytes),
          value: z.number().finite().nonnegative(),
          unit: z.string().trim().min(1).max(40),
          method: z.string().trim().max(120),
          basis: z.string().trim().max(80),
        }),
      )
      .max(supplementalSoilAnalytes.length)
      .optional(),
    season: z.enum(["KHARIF", "RABI", "ZAID"]).optional(),
    barleyUse: z
      .enum(["UNKNOWN", "FEED", "MALT", "HULLESS", "DUAL_PURPOSE"])
      .default("UNKNOWN"),
    waterRegime: z.enum(["UNKNOWN", "IRRIGATED", "RAINFED"]).default("UNKNOWN"),
    sowingCondition: z.enum(["UNKNOWN", "TIMELY", "LATE"]).default("UNKNOWN"),
    nutrientUnit: unit.default("UNKNOWN"),
    nitrogenUnit: unit.optional(),
    phosphorusUnit: unit.optional(),
    potassiumUnit: unit.optional(),
    phosphorusBasis: z
      .preprocess(basis, z.enum(["P", "P2O5", "UNKNOWN"]))
      .default("UNKNOWN"),
    potassiumBasis: z
      .preprocess(basis, z.enum(["K", "K2O", "UNKNOWN"]))
      .default("UNKNOWN"),
    nitrogenMethod: method,
    phosphorusMethod: method,
    potassiumMethod: method,
    organicCarbonMethod: method,
    phMethod: z
      .preprocess(
        (value) =>
          typeof value === "string"
            ? (canonicalSoilPhMethod(value) ?? value.trim().toUpperCase())
            : value,
        z.enum(["WATER_1_2_5", "OTHER", "UNKNOWN"]),
      )
      .default("UNKNOWN"),
    laboratoryName: z.string().trim().max(160).default(""),
    reportNumber: z.string().trim().max(100).default(""),
    referenceStandardId: z
      .enum(["UNKNOWN", ...soilStandards.map((standard) => standard.id)])
      .default("UNKNOWN"),
    labReferenceConfirmed: z.boolean().default(false),
    sampleDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return (
          !Number.isNaN(date.getTime()) &&
          date.toISOString().slice(0, 10) === value &&
          value <= indiaDateKey(new Date()) &&
          value >= "1900-01-01"
        );
      }, "Enter a real sample date, not a future date.")
      .optional(),
    fieldAreaHa: z.number().finite().positive().max(100000).optional(),
    reportDate: z.iso
      .date()
      .refine(
        (value) => value <= indiaDateKey(new Date()) && value >= "1900-01-01",
        "Enter a laboratory report date that is not in the future.",
      )
      .optional(),
    samplingDepthCm: z.number().finite().gt(0).max(200).optional(),
    farmId: id,
    fieldId: id,
    cropId: id,
    cropCycleId: id,
  })
  .superRefine((input, ctx) => {
    if (
      input.reportDate &&
      input.sampleDate &&
      input.reportDate < input.sampleDate
    )
      ctx.addIssue({
        code: "custom",
        message: "Laboratory report date cannot precede the sample date.",
        path: ["reportDate"],
      });
    if (
      input.supplementalReadings &&
      new Set(input.supplementalReadings.map((row) => row.analyte)).size !==
        input.supplementalReadings.length
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Enter only one supplemental laboratory reading for each analyte.",
        path: ["supplementalReadings"],
      });
    }
    if (
      !input.nutritionSamples?.length &&
      !input.supplementalReadings?.length &&
      [
        input.nitrogenKgHa,
        input.phosphorusKgHa,
        input.potassiumKgHa,
        input.nitrogenValue,
        input.phosphorusValue,
        input.potassiumValue,
        input.soilPh,
        input.organicCarbonPercent,
      ].every((value) => value === undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "Enter at least one measured laboratory result.",
        path: ["soilPh"],
      });
    if (
      input.mode === "REAL" &&
      (input.synthetic === true ||
        input.demoFixtureId ||
        input.dataLabel === "DEMO DATA")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Synthetic samples must stay in Demo Mode. They cannot be submitted as real laboratory samples.",
        path: ["mode"],
      });
    if (
      input.mode === "DEMO" &&
      (input.fieldId || input.farmId || input.cropCycleId)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Demo samples cannot be linked to real farms, fields or crop cycles.",
        path: ["fieldId"],
      });
    if (input.mode === "DEMO" && input.labReferenceConfirmed)
      ctx.addIssue({
        code: "custom",
        message: "Demo data cannot carry laboratory confirmation.",
        path: ["labReferenceConfirmed"],
      });
    if (
      input.mode === "REAL" &&
      input.labReferenceConfirmed &&
      (!input.laboratoryName || input.referenceStandardId === "UNKNOWN")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Record the issuing laboratory and reference before confirming equivalence.",
        path: ["laboratoryName"],
      });
  })
  .transform((input) =>
    input.mode === "DEMO"
      ? {
          ...input,
          synthetic: true,
          dataLabel: "DEMO DATA" as const,
          labReferenceConfirmed: false,
          laboratoryName: "",
          reportNumber: "",
        }
      : {
          ...input,
          synthetic: false,
          dataLabel: "REAL LABORATORY MODE" as const,
        },
  );

/** Avoid unlocalizable Zod implementation wording while retaining the failing field. */
export function soilValidationError(issue: {
  code: string;
  message: string;
  path: PropertyKey[];
}) {
  if (issue.code === "custom") return issue.message;
  const fields: Record<string, string> = {
    state: "State",
    district: "District",
    crop: "Crop",
    growthStage: "Growth stage",
    soilType: "Soil type",
    nitrogenKgHa: "Available nitrogen",
    phosphorusKgHa: "Available phosphorus",
    potassiumKgHa: "Available potassium",
    organicCarbonPercent: "Organic carbon",
    soilPh: "Soil pH",
    sampleDate: "Sample date",
    samplingDepthCm: "Sampling depth",
    laboratoryName: "Laboratory name",
    nutrientUnit: "Nutrient measurement unit",
    phosphorusBasis: "Phosphorus basis",
    potassiumBasis: "Potassium basis",
  };
  const field = fields[String(issue.path[0])] ?? "Laboratory details";
  return `Check ${field}: value is missing, invalid or outside the allowed range.`;
}
