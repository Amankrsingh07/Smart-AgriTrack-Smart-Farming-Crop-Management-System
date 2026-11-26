import { nutritionSampleSchema } from "./nutrition-evidence";
import {
  soilTrendGroups,
  soilTrendMetrics,
  type SoilTrendGroup,
} from "./soil-health-trends";
import { isDemoSoilSample } from "./soil-sample-mode";

type Report = Parameters<typeof soilTrendGroups>[0][number];

export function advancedNutritionTrends(reports: Report[], fieldId: string) {
  const measured = new Map<string, SoilTrendGroup>();
  for (const report of reports) {
    const input = report.input;
    if (
      input?.fieldId !== fieldId ||
      input.mode !== "REAL" ||
      isDemoSoilSample(input, report.result)
    )
      continue;
    for (const raw of input.nutritionSamples ?? []) {
      const parsed = nutritionSampleSchema.safeParse(raw);
      if (!parsed.success) continue;
      const sample = parsed.data;
      const scope =
        sample.group === "water"
          ? sample.sourceOrPart
          : sample.group === "tissue"
            ? sample.variety &&
              sample.stage &&
              sample.sourceOrPart &&
              input.cropId
              ? [
                  input.cropId,
                  sample.variety,
                  sample.stage,
                  sample.sourceOrPart,
                ]
              : null
            : sample.depth;
      if (!scope) continue;
      for (const row of sample.measurements) {
        if (
          !row.method ||
          !row.basis ||
          [row.method, row.unit, row.basis].some((value) =>
            /^(unknown|unspecified|n\/a)$/i.test(value),
          )
        )
          continue;
        const key = JSON.stringify([
          sample.group,
          row.parameter,
          sample.sampleLocation,
          sample.laboratory,
          scope,
          row.unit,
          row.basis,
          row.method,
          row.extractionMethod,
        ]);
        const group = measured.get(key) ?? {
          key,
          label: `${row.parameter} · ${sample.group} · ${sample.sampleLocation} · ${sample.laboratory} · ${row.method} · ${row.basis}`,
          unit: row.unit,
          points: [],
        };
        group.points.push({
          id: `${report.id}:${sample.sampleId}`,
          date: sample.sampleDate,
          value: row.value,
        });
        measured.set(key, group);
      }
    }
  }
  return [
    ...soilTrendMetrics.flatMap((metric) =>
      soilTrendGroups(reports, fieldId, metric).map((group) => ({
        ...group,
        key: metric + group.key,
        label: `${metric.replace("KgHa", "").replace("Percent", "")} · ${group.label}`,
      })),
    ),
    ...measured.values(),
  ]
    .filter(
      (group) => new Set(group.points.map((point) => point.date)).size >= 2,
    )
    .map((group) => ({
      ...group,
      points: group.points.toSorted((a, b) => a.date.localeCompare(b.date)),
    }));
}
