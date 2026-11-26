import { z } from "zod";
import data from "../data/agriculture/water-quality-fao.json";
import type { ProtectionLab } from "./crop-protection-labs";
export const waterReferenceSchema = z
  .object({
    version: z.string(),
    source: z.object({
      organization: z.string(),
      name: z.string(),
      version: z.string(),
      url: z.url(),
      reviewedOn: z.iso.date(),
    }),
    scope: z.string(),
    tds: z.object({
      unit: z.literal("mg/L"),
      noneBelow: z.number().positive(),
      moderateThrough: z.number().positive(),
    }),
    infiltration: z
      .array(
        z.object({
          sarMin: z.number().nonnegative(),
          sarMax: z.number().positive(),
          severeBelowEC: z.number().nonnegative(),
          noneAboveEC: z.number().positive(),
        }),
      )
      .length(5),
    limits: z.string(),
  })
  .strict();
export const waterQualityReference = waterReferenceSchema.parse(data);
const norm = (s: string) => s.trim().toLowerCase();
export function assessWaterSodium(labs: ProtectionLab[]) {
  const ec = labs.filter(
    (l) =>
      l.matrix === "Water" &&
      norm(l.parameter) === "ec" &&
      l.unit === "dS/m" &&
      [
        "EC corrected to 25°C",
        "EC at 25°C",
        "Electrical conductivity at 25°C",
      ].some((m) => norm(m) === norm(l.method)) &&
      l.laboratory &&
      l.reportReference,
  );
  const sar = labs.filter(
    (l) =>
      l.matrix === "Water" &&
      norm(l.parameter) === "sar" &&
      ["SAR", "(meq/L)^0.5", "(mmol/L)^0.5"].includes(l.unit) &&
      l.method &&
      l.laboratory &&
      l.reportReference,
  );
  if (ec.length !== 1 || sar.length !== 1)
    return {
      status: "Insufficient data",
      explanation:
        "Joint sodium/infiltration screening requires one laboratory-reported SAR and one 25°C EC in dS/m from the same identified sample.",
      reference: waterQualityReference.source,
    };
  const a = ec[0],
    b = sar[0];
  if (
    !a.sampleLocation ||
    a.sampleLocation !== b.sampleLocation ||
    a.sampleDate !== b.sampleDate ||
    a.laboratory !== b.laboratory ||
    a.reportReference !== b.reportReference
  )
    return {
      status: "Insufficient data",
      explanation:
        "EC and SAR sample location/date/laboratory/report do not identify the same sample; do not combine them.",
      reference: waterQualityReference.source,
    };
  if ([3, 6, 12, 20].includes(b.value))
    return {
      status: "Reference boundary review",
      explanation:
        "The reported SAR lies at a shared published band boundary. Ask the laboratory for applicable interpretation; no band is guessed.",
      reference: waterQualityReference.source,
    };
  const band = waterQualityReference.infiltration.find(
    (r) => b.value >= r.sarMin && b.value <= r.sarMax,
  );
  if (!band)
    return {
      status: "Outside configured reference",
      explanation:
        "SAR is outside the configured reference ranges; qualified interpretation is required.",
      reference: waterQualityReference.source,
    };
  const status =
    a.value < band.severeBelowEC
      ? "Severe infiltration restriction"
      : a.value > band.noneAboveEC
        ? "No infiltration restriction indicated by this EC/SAR pair"
        : "Slight to moderate infiltration restriction";
  return {
    status,
    explanation: `Farmer-submitted unverified values: EC ${a.value} dS/m and SAR ${b.value} ${b.unit}. ${waterQualityReference.scope} ${waterQualityReference.limits}`,
    reference: waterQualityReference.source,
  };
}
