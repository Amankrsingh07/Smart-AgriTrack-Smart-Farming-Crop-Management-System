import { soilNutrientReading } from "./soil-nutrient-reading";
import { isDemoSoilSample } from "./soil-sample-mode";
import { soilReadiness } from "./soil-health-readiness";
import type { SoilHealthInput } from "./soil-health";
type SoilRecord = {
  id: string;
  input: unknown;
  result: unknown;
  sampleDate: Date | null;
  createdAt: Date;
};
export type SoilContextIssue = { code: string; message: string };
const object = (value: unknown) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function preventionSoilContext(
  records: SoilRecord[],
  context: {
    fieldId: string;
    cropId: string;
    cropCycleId: string;
    crop: string;
  },
  now = new Date(),
) {
  const real = records.filter((record) => {
    const input = object(record.input);
    return (
      input.mode === "REAL" && !isDemoSoilSample(input, object(record.result))
    );
  });
  const matching = real.filter((record) => {
    const input = object(record.input);
    return (
      input.fieldId === context.fieldId &&
      (input.cropCycleId === context.cropCycleId ||
        input.cropId === context.cropId)
    );
  });
  const dated = matching.filter(
    (record) =>
      record.sampleDate &&
      record.sampleDate <= now &&
      object(record.input).sampleDate ===
        record.sampleDate.toISOString().slice(0, 10),
  );
  // The route supplies newest sample date first. Never borrow another crop’s report.
  const selected = dated[0] ?? null;
  const candidate = selected ?? matching[0] ?? null;
  const issues: SoilContextIssue[] = [];
  if (!records.length)
    issues.push({
      code: "NO_FIELD_REPORT",
      message: `No soil report is saved for this field. Add an actual laboratory report for ${context.crop}.`,
    });
  else if (!real.length)
    issues.push({
      code: "NO_REAL_REPORT",
      message:
        "Available field reports are DEMO DATA or have unknown origin. Add a dated Real Laboratory Mode report; synthetic/legacy origin is not inferred as real.",
    });
  else if (!matching.length)
    issues.push({
      code: "CROP_LINK_MISMATCH",
      message: `Field soil reports belong to another crop or have no matching crop/cycle link. Add or link an actual ${context.crop} report; another crop’s interpretation is not substituted.`,
    });
  if (candidate) {
    const input = object(candidate.input) as unknown as SoilHealthInput;
    if (!selected)
      issues.push({
        code:
          candidate.sampleDate && candidate.sampleDate > now
            ? "FUTURE_SAMPLE_DATE"
            : "MISSING_SAMPLE_DATE",
        message:
          "The matching report has no valid consistent sample date, or its sample date is in the future. Record the actual laboratory sample date.",
      });
    for (const item of soilReadiness(input))
      issues.push({ code: item.key, message: item.message });
    for (const [key, title] of [
      ["nitrogenKgHa", "Nitrogen"],
      ["phosphorusKgHa", "Phosphorus"],
      ["potassiumKgHa", "Potassium"],
      ["organicCarbonPercent", "Organic carbon"],
      ["soilPh", "Soil pH"],
    ] as const) {
      const value =
        key === "soilPh" || key === "organicCarbonPercent"
          ? input[key]
          : soilNutrientReading(
              input,
              key === "nitrogenKgHa"
                ? "nitrogen"
                : key === "phosphorusKgHa"
                  ? "phosphorus"
                  : "potassium",
            ).value;
      if (typeof value !== "number" || !Number.isFinite(value))
        issues.push({
          code: `missing:${key}`,
          message: `${title} reading is missing. Enter it only if measured by the laboratory; a partial report can still be retained.`,
        });
    }
    const report = object(candidate.result);
    if (
      !["soil-modes-v4", "soil-basis-v5"].includes(
        String(report.analysisVersion),
      )
    )
      issues.push({
        code: "LEGACY_INTERPRETATION",
        message:
          "This report uses older interpretation rules. Preserve it and create a revised report with actual laboratory details before source-backed prevention review.",
      });
    const rows = [
      ...(Array.isArray(report.nutrients) ? report.nutrients : []),
      ...(report.organicCarbon ? [report.organicCarbon] : []),
    ];
    for (const row of rows) {
      const value = object(row);
      if (value.rating === "Unknown" && typeof value.guidance === "string")
        issues.push({
          code: `unknown:${String(value.name)}`,
          message: `${String(value.name)}: ${value.guidance}`,
        });
    }
    const ph = object(report.ph);
    if (ph.rating === "Unknown" && typeof ph.guidance === "string")
      issues.push({ code: "unknown:ph", message: `Soil pH: ${ph.guidance}` });
  }
  return {
    selected,
    issues,
    checkedReports: records.length,
    otherCropReports: real.length - matching.length,
    reportId: candidate?.id ?? null,
    status: selected
      ? `Using saved sample ${selected.sampleDate!.toISOString().slice(0, 10)}. Each indicator keeps its own validated/Unknown status; applicability confirmation is farmer-recorded, not independent verification.`
      : "Insufficient Data: no compatible, dated real soil report for this crop/field.",
  };
}
