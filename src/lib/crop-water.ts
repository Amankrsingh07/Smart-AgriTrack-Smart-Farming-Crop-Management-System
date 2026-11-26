import {
  WaterMeasure,
  type CropWaterStage as CropWaterStageRecord,
} from "@prisma/client";

export type WaterMeasureValue = {
  period: string;
  measure: string;
  valueMm: string;
  source?: string;
  sourceUrl?: string;
  notes?: string;
  isFullSeasonTotal: boolean;
  waterMeasure: WaterMeasure;
};

export function waterValues(
  stages: CropWaterStageRecord[],
): WaterMeasureValue[] {
  const measureLabels: Record<WaterMeasure, string> = {
    CROP_ETC: "Crop ETc",
    EFFECTIVE_RAINFALL: "Effective rainfall",
    IRRIGATION_REQUIREMENT: "Irrigation requirement",
    CROP_WATER_PLUS_EFFECTIVE_RAINFALL:
      "Total crop water (includes effective rainfall)",
  };
  return stages.flatMap((stage) => {
    if (!stage.waterMeasure) return [];
    const exact = stage.waterRequirementMm?.toNumber();
    const minimum = stage.minimumWaterRequirementMm?.toNumber();
    const maximum = stage.maximumWaterRequirementMm?.toNumber();
    const valueMm =
      exact !== undefined
        ? formatMm(exact)
        : minimum !== undefined && maximum !== undefined
          ? `${formatMm(minimum)}–${formatMm(maximum)}`
          : undefined;
    if (!valueMm) return [];
    return [
      {
        period: stage.isFullSeasonTotal ? "Full season" : stage.stageName,
        measure: measureLabels[stage.waterMeasure],
        valueMm,
        source: stage.source ?? undefined,
        sourceUrl: stage.sourceUrl ?? undefined,
        notes: stage.notes ?? undefined,
        isFullSeasonTotal: stage.isFullSeasonTotal,
        waterMeasure: stage.waterMeasure,
      },
    ];
  });
}

export function exactFullSeasonEtc(values: WaterMeasureValue[]) {
  const value = values.find(
    (item) =>
      item.isFullSeasonTotal &&
      item.waterMeasure === WaterMeasure.CROP_ETC &&
      !item.valueMm.includes("–"),
  );
  return value ? Number(value.valueMm) : undefined;
}

export function waterConfigurationMessage(
  category: string | undefined,
  season: string,
  values: WaterMeasureValue[],
  cropName?: string,
  exactCropProfile = true,
) {
  const hasEtc = values.some(
    (item) => item.waterMeasure === WaterMeasure.CROP_ETC,
  );
  if (!values.length) {
    if (cropName && isAggregateCropName(cropName)) {
      return `“${cropName}” is a combined historical crop group. Configure an exact species and ${season} water profile before assigning a millimetre value.`;
    }
    if (!exactCropProfile) {
      return `No exact Crop profile is configured for this historical label; ${season} soil and water requirements cannot be joined.`;
    }
    return category
      ? `Only the qualitative ${category} water category is configured. No ${season} ETc or irrigation depth in mm is configured.`
      : `No ${season} crop water-stage profile is configured; no ETc or irrigation value in mm is available.`;
  }
  if (!hasEtc) {
    return `The configured values above are not crop ETc. A ${season} ETc total has not been configured.`;
  }
  return undefined;
}

export function isAggregateCropName(name: string) {
  const key = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]/g, "");
  return key.includes("peasandbeans") && key.includes("pulses");
}

function formatMm(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}
