import { z } from "zod";
import { indiaDateKey } from "./crop-cycle-status";

export const evidenceCatalog = {
  secondary: ["Calcium", "Magnesium", "Sulphur"],
  micro: ["Zinc", "Boron", "Iron", "Manganese", "Copper", "Molybdenum", "Chlorine", "Nickel"],
  properties: ["Soil pH", "Organic carbon", "Organic matter", "Electrical conductivity", "Soil moisture", "Soil temperature", "Soil texture", "Sand percentage", "Silt percentage", "Clay percentage", "Bulk density", "Particle density", "Soil porosity", "Water holding capacity", "Field capacity", "Permanent wilting point", "Available water capacity", "Cation exchange capacity", "Exchangeable sodium percentage", "Calcium carbonate", "Exchangeable calcium", "Exchangeable magnesium", "Exchangeable sodium", "Exchangeable potassium", "Base saturation", "Soil compaction", "Soil drainage", "Soil permeability", "Infiltration rate", "Soil depth", "Soil salinity", "Soil sodicity", "Soil acidity", "Soil alkalinity", "Soil erosion", "Soil biological indicator", "Microbial biomass", "Lead", "Cadmium", "Chromium", "Arsenic", "Mercury"],
  water: ["pH", "EC", "TDS", "Sodium", "Calcium", "Magnesium", "Potassium", "Chloride", "Carbonate", "Bicarbonate", "Sulphate", "Nitrate", "Boron", "Fluoride", "SAR", "Adjusted SAR", "RSC", "Total hardness", "Alkalinity", "Lead", "Cadmium", "Chromium", "Arsenic", "Mercury"],
  tissue: ["Nitrogen", "Phosphorus", "Potassium", "Calcium", "Magnesium", "Sulphur", "Zinc", "Boron", "Iron", "Manganese", "Copper", "Molybdenum", "Chlorine", "Nickel"],
} as const;
const text = z.string().trim().max(180);
const sampleDate = z.iso.date().refine(value => value >= "1900-01-01" && value <= indiaDateKey(new Date()));

export const nutritionMeasurementSchema = z.object({
  parameter: text.min(1), value: z.number().finite().min(-1e9).max(1e9), unit: text.min(1),
  method: text.optional(), extractionMethod: text.optional(), basis: text.optional(), detectionLimit: text.optional(),
  uncertainty: text.optional(), referenceRange: text.optional(),
});

export const nutritionSampleSchema = z.object({
  group: z.enum(["secondary", "micro", "properties", "water", "tissue"]),
  sampleId: text.min(1), sampleDate, reportDate: sampleDate.optional(),
  sampleLocation: text.min(1), depth: text.optional(), laboratory: text.min(1), reportNumber: text.min(1),
  observations: z.string().trim().max(1500).optional(), sourceOrPart: text.optional(),
  variety: text.optional(), stage: text.optional(), measurements: z.array(nutritionMeasurementSchema).min(1).max(50),
}).superRefine((sample, ctx) => {
  if (sample.reportDate && sample.reportDate < sample.sampleDate) ctx.addIssue({ code: "custom", path: ["reportDate"], message: "Report date cannot precede the sample date." });
  if (sample.group === "tissue" && (!sample.sourceOrPart || !sample.stage)) ctx.addIssue({ code: "custom", path: ["sourceOrPart"], message: "Record the plant part and sampled growth stage." });
  const allowed: readonly string[] = evidenceCatalog[sample.group];
  if (sample.measurements.some(row => !allowed.includes(row.parameter) || (row.value < 0 && !["Soil temperature", "RSC"].includes(row.parameter))))
    ctx.addIssue({ code: "custom", path: ["measurements"], message: "Use a supported measurement for this sample group and check its value." });
  if (new Set(sample.measurements.map(row => row.parameter)).size !== sample.measurements.length)
    ctx.addIssue({ code: "custom", path: ["measurements"], message: "Record one value per measurement in each sample." });
});

export type NutritionSample = z.infer<typeof nutritionSampleSchema>;
