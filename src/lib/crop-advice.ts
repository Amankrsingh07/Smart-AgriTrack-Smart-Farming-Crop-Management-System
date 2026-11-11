import { WaterMeasure } from "@prisma/client";
import { db } from "@/lib/db";
import { waterValues } from "@/lib/crop-water";

export type CropAdviceInput = {
  state: string;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  soilPh: number;
  temperatureC: number;
  rainfallMm: number;
};

const seasonForNow = () => {
  const month = new Date().getMonth() + 1;
  return month >= 6 && month <= 10 ? "KHARIF" as const : month >= 4 && month <= 5 ? "ZAID" as const : "RABI" as const;
};

export async function getCropAdvice(input: CropAdviceInput) {
  const season = seasonForNow();
  const crops = await db.crop.findMany({
    where: {
      locationSuitabilities: { some: { state: input.state, season } },
      cropSeasons: { some: { season } },
    },
    include: {
      locationSuitabilities: { where: { state: input.state, season } },
      soilRequirements: true,
      climateRequirement: true,
      cropSeasons: { where: { season }, include: { waterStages: { where: { waterMeasure: { not: null } }, orderBy: [{ startDay: "asc" }, { stageName: "asc" }] } } },
    },
  });

  return crops.flatMap(crop => {
    const soilProfiles = crop.soilRequirements.map(soil => ({ soilType: soil.soilType, scores: [
      scoreRange(input.nitrogen, soil.minNitrogenKgHa, soil.maxNitrogenKgHa),
      scoreRange(input.phosphorus, soil.minPhosphorusKgHa, soil.maxPhosphorusKgHa),
      scoreRange(input.potassium, soil.minPotassiumKgHa, soil.maxPotassiumKgHa),
      scoreRange(input.soilPh, soil.minPh, soil.maxPh),
    ].filter((value): value is number => value !== null) })).filter(profile => profile.scores.length > 0);
    const bestSoil = soilProfiles.sort((a, b) => average(b.scores) - average(a.scores))[0];
    const configuredSoilScores = bestSoil?.scores ?? [];
    const climate = crop.climateRequirement;
    const climateScores = climate ? [scoreRange(input.temperatureC, climate.minTemperatureC, climate.maxTemperatureC), scoreRange(input.rainfallMm, climate.minRainfallMm, climate.maxRainfallMm)].filter((value): value is number => value !== null) : [];
    const criteria = [...configuredSoilScores, ...climateScores];
    if (!crop.sourceUrl) return [];
    const water = waterValues(crop.cropSeasons.flatMap(item => item.waterStages));
    if (!criteria.length && !water.length) return [];
    const waterNeed = water.find(item => item.isFullSeasonTotal && item.waterMeasure === WaterMeasure.CROP_ETC);
    const score = criteria.length >= 2 ? Math.round(average(criteria)) : null;
    const reasons = [
      `${configuredSoilScores.length ? `${configuredSoilScores.length} soil test measure${configuredSoilScores.length === 1 ? "" : "s"} compared with the closest ${bestSoil?.soilType} profile.` : "No NPK or soil-pH ranges are configured."} ${climateScores.length ? `${climateScores.length} climate measure${climateScores.length === 1 ? "" : "s"} compared.` : "No temperature or rainfall ranges are configured."}`,
      ...crop.locationSuitabilities.map(item => item.notes).filter((note): note is string => Boolean(note)),
    ];
    return [{
      id: crop.id,
      name: crop.name,
      score,
      assessedFactors: criteria.length,
      label: bestSoil?.soilType ? `Closest soil profile: ${bestSoil.soilType}` : "State crop profile",
      reasons,
      waterNeed: waterNeed?.valueMm,
      waterSource: waterNeed?.source,
      waterSourceUrl: waterNeed?.sourceUrl,
      waterMeasures: water,
      source: crop.source,
      sourceUrl: crop.sourceUrl,
    }];
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function scoreRange(value: number, minimum: { toNumber(): number } | null, maximum: { toNumber(): number } | null) {
  const min = minimum?.toNumber();
  const max = maximum?.toNumber();
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && value < min) return Math.max(0, Math.round(100 - ((min - value) / Math.max(Math.abs(min) * 0.25, 1)) * 25));
  if (max !== undefined && value > max) return Math.max(0, Math.round(100 - ((value - max) / Math.max(Math.abs(max) * 0.25, 1)) * 25));
  return 100;
}

function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
