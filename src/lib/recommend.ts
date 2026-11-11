import { db } from "@/lib/db";
import { scoreSuitability } from "@/lib/recommendation-score";
import { climateSuggestions } from "@/lib/climate-recommend";
import { exactFullSeasonEtc, waterConfigurationMessage, waterValues } from "@/lib/crop-water";

export type RecommendationInput = { state: string; district?: string; season: "KHARIF" | "RABI" | "ZAID"; soilType: string; water: "LOW" | "MEDIUM" | "HIGH" };

async function getConfiguredCrops(input: RecommendationInput) {
  const state = input.state.trim();
  const district = input.district?.trim() || "";
  const districtFilter = district ? { OR: [{ district: "" }, { district }] } : { district: "" };
  return db.crop.findMany({
    where: { locationSuitabilities: { some: { state, season: input.season, ...districtFilter } } },
    include: {
      locationSuitabilities: { where: { state, season: input.season, ...districtFilter } },
      cropSeasons: { where: { season: input.season }, include: { waterStages: { where: { waterMeasure: { not: null } }, orderBy: [{ startDay: "asc" }, { stageName: "asc" }] } } },
    },
  });
}

export async function recommendCrops(input: RecommendationInput) {
  const climate = climateSuggestions(input);
  let crops: Awaited<ReturnType<typeof getConfiguredCrops>> = [];
  try { crops = await getConfiguredCrops(input); } catch { /* Keep built-in seasonal examples available without the crop database. */ }
  const configured = crops.map(c => {
    const soils = (c.soilTypes || "").split(",").map(s => s.trim().toLowerCase());
    const scored = scoreSuitability(soils.includes(input.soilType.toLowerCase()), c.waterNeed, input.water);
    const loc = c.locationSuitabilities[0];
    if (loc?.notes) scored.reasons.push(loc.notes);
    const waterData = waterValues(c.cropSeasons.flatMap(season => season.waterStages));
    return { id: c.id, name: c.name, score: scored.score, category: scored.score >= 75 ? "Good match" : scored.score >= 50 ? "Possible match" : "Needs consideration", water: c.waterNeed.toLowerCase(), waterNeedMm: exactFullSeasonEtc(waterData), waterData, waterMessage: waterConfigurationMessage(c.waterNeed.toLowerCase(), input.season, waterData), description: c.description, reasons: scored.reasons, illustrative: c.illustrative, source: "profile" as const };
  }).sort((a, b) => b.score - a.score);
  const climateCrops = climate && climate.crops.length ? climate.crops : [];
  let savedClimateCrops: Array<{ id: string; name: string }> = [];
  if (climateCrops.length) {
    try { savedClimateCrops = await db.crop.findMany({ where: { name: { in: climateCrops.map(crop => crop.name) } }, select: { id: true, name: true } }); }
    catch { /* The built-in catalog remains usable without crop IDs. */ }
  }
  const idsByName = new Map(savedClimateCrops.map(crop => [crop.name.toLowerCase(), crop.id]));
  const climateResults = climateCrops.map(crop => ({
    ...crop,
    dbCropId: idsByName.get(crop.name.toLowerCase()),
    climateInfo: { rainfallMm: climate?.rainfallMm ?? 0, temperatureC: climate?.temperatureC ?? 0 },
  }));
  const coveredNames = new Set(climateResults.map(crop => normalizeCropName(crop.name)));
  const otherResults = [...configured]
    .filter(crop => !coveredNames.has(normalizeCropName(crop.name)));
  return [...climateResults, ...otherResults];
}

function normalizeCropName(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
