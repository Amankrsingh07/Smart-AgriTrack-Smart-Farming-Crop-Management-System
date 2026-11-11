import type { RecommendationInput } from "@/lib/recommend";

type SeasonName = "Kharif" | "Rabi" | "Zaid";
type CropInfo = { name: string; seasons: SeasonName[]; states: string[]; soils: string[]; waterMm: number; rainMin: number; rainMax: number; tempMin: number; tempMax: number };

const stateCodes: Record<string, string> = { Uttarakhand: "UK", "Uttar Pradesh": "UP", Punjab: "PB", Bihar: "BR", Maharashtra: "MH" };
const allStates = "UK,UP,PB,BR,MH".split(",");
const seasonalClimate: Record<string, Record<string, [number, number, number, number, number, number]>> = {
  Uttarakhand: { Dehradun: [1700, 26, 250, 15, 150, 28], Haridwar: [950, 29, 120, 18, 80, 33], Nainital: [1500, 22, 200, 12, 120, 24] },
  "Uttar Pradesh": { Bareilly: [850, 29, 100, 18, 60, 33], Lucknow: [850, 29, 80, 18, 50, 34], Meerut: [700, 29, 90, 17, 50, 33] },
  Punjab: { Ludhiana: [600, 29, 120, 15, 40, 32], Amritsar: [550, 29, 110, 14, 40, 32] },
  Maharashtra: { Pune: [600, 25, 50, 22, 40, 29], Nagpur: [900, 28, 60, 22, 30, 34] },
  Bihar: { Patna: [950, 29, 60, 19, 60, 33] },
};

const crops: CropInfo[] = [
  { name: "Rice (Paddy)", seasons: ["Kharif"], states: allStates, soils: ["Clay", "Loamy"], waterMm: 1200, rainMin: 800, rainMax: 2000, tempMin: 22, tempMax: 32 },
  { name: "Maize", seasons: ["Kharif", "Rabi"], states: allStates, soils: ["Loamy", "Sandy"], waterMm: 550, rainMin: 200, rainMax: 1000, tempMin: 18, tempMax: 32 },
  { name: "Cotton", seasons: ["Kharif"], states: ["PB", "MH"], soils: ["Black", "Loamy"], waterMm: 700, rainMin: 500, rainMax: 1000, tempMin: 21, tempMax: 35 },
  { name: "Soybean", seasons: ["Kharif"], states: ["MH", "UP", "UK"], soils: ["Black", "Loamy"], waterMm: 450, rainMin: 600, rainMax: 1000, tempMin: 20, tempMax: 32 },
  { name: "Sugarcane", seasons: ["Kharif", "Zaid"], states: ["UP", "UK", "BR", "PB", "MH"], soils: ["Loamy", "Clay", "Black"], waterMm: 1800, rainMin: 800, rainMax: 1500, tempMin: 20, tempMax: 35 },
  { name: "Bajra", seasons: ["Kharif"], states: ["UP", "PB", "MH"], soils: ["Sandy", "Loamy"], waterMm: 350, rainMin: 300, rainMax: 700, tempMin: 25, tempMax: 35 },
  { name: "Wheat", seasons: ["Rabi"], states: allStates, soils: ["Loamy", "Clay"], waterMm: 450, rainMin: 50, rainMax: 300, tempMin: 10, tempMax: 25 },
  { name: "Mustard", seasons: ["Rabi"], states: ["UP", "PB", "BR", "UK"], soils: ["Loamy", "Sandy"], waterMm: 250, rainMin: 30, rainMax: 200, tempMin: 10, tempMax: 25 },
  { name: "Chickpea (Gram)", seasons: ["Rabi"], states: ["UP", "MH", "PB", "BR"], soils: ["Loamy", "Black", "Sandy"], waterMm: 300, rainMin: 40, rainMax: 150, tempMin: 15, tempMax: 28 },
  { name: "Potato", seasons: ["Rabi"], states: ["UP", "UK", "PB", "BR"], soils: ["Loamy", "Sandy"], waterMm: 500, rainMin: 50, rainMax: 300, tempMin: 12, tempMax: 24 },
  { name: "Lentil", seasons: ["Rabi"], states: ["UP", "BR", "UK"], soils: ["Loamy"], waterMm: 250, rainMin: 30, rainMax: 200, tempMin: 12, tempMax: 25 },
  { name: "Moong", seasons: ["Kharif", "Zaid"], states: allStates, soils: ["Loamy", "Sandy"], waterMm: 300, rainMin: 30, rainMax: 700, tempMin: 25, tempMax: 35 },
  { name: "Watermelon", seasons: ["Zaid"], states: ["UP", "PB", "MH", "BR"], soils: ["Sandy", "Loamy"], waterMm: 400, rainMin: 20, rainMax: 150, tempMin: 24, tempMax: 35 },
  { name: "Cucumber", seasons: ["Zaid"], states: allStates, soils: ["Loamy", "Sandy"], waterMm: 350, rainMin: 20, rainMax: 150, tempMin: 20, tempMax: 35 },
  { name: "Sunflower", seasons: ["Zaid"], states: ["PB", "MH", "UP"], soils: ["Loamy", "Black"], waterMm: 600, rainMin: 20, rainMax: 150, tempMin: 20, tempMax: 35 },
  { name: "Okra", seasons: ["Kharif", "Zaid"], states: allStates, soils: ["Loamy"], waterMm: 450, rainMin: 30, rainMax: 1200, tempMin: 22, tempMax: 35 },
];

const cropAliases: Record<string, string> = { masoor: "lentil", gram: "chickpeagram", paddy: "ricepaddy" };
export function cropReferenceByName(name: string) {
  const normalizedName = normalize(name);
  const lookupName = cropAliases[normalizedName] ?? normalizedName;
  const crop = crops.find(item => normalize(item.name) === lookupName);
  if (!crop) return null;
  const waterNeed: "LOW" | "MEDIUM" | "HIGH" = crop.waterMm <= 350 ? "LOW" : crop.waterMm <= 700 ? "MEDIUM" : "HIGH";
  return { soilTypes: crop.soils, waterNeed, waterNeedMm: crop.waterMm };
}

const seasonIndex: Record<SeasonName, number> = { Kharif: 0, Rabi: 1, Zaid: 2 };
const seasonName: Record<RecommendationInput["season"], SeasonName> = { KHARIF: "Kharif", RABI: "Rabi", ZAID: "Zaid" };
const extraWaterMm: Record<RecommendationInput["water"], number> = { LOW: 100, MEDIUM: 350, HIGH: 800 };
const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export function climateSuggestions(input: RecommendationInput) {
  const state = Object.keys(stateCodes).find(name => normalize(name) === normalize(input.state));
  const districtData = state ? Object.entries(seasonalClimate[state] ?? {}).find(([name]) => normalize(name) === normalize(input.district ?? ""))?.[1] : undefined;
  const season = seasonName[input.season];
  if (!state || !districtData) {
    const seasonalExamples: Record<SeasonName, string[]> = {
      Kharif: ["Rice (Paddy)", "Maize", "Moong"],
      Rabi: ["Wheat", "Mustard", "Chickpea (Gram)"],
      Zaid: ["Moong", "Watermelon", "Cucumber"],
    };
    return {
      state: input.state,
      district: input.district ?? "",
      season,
      rainfallMm: null,
      temperatureC: null,
      crops: seasonalExamples[season].map((name, index) => {
        const crop = crops.find(item => normalize(item.name) === normalize(name))!;
        return {
          id: `seasonal-example-${normalize(input.state)}-${normalize(input.district ?? "")}-${normalize(name)}`,
          name: crop.name,
          score: 50,
          category: "Seasonal example",
          water: `${crop.waterMm} mm total (reference estimate)`,
          waterNeedMm: crop.waterMm,
          irrigationNeedMm: null,
          description: "Built-in seasonal example; local soil, water, and climate suitability has not been assessed.",
          reasons: [`Example ${season} crop ${index + 1} from the built-in catalog.`, "Confirm suitability with your local KVK or agriculture officer."],
          illustrative: true,
          source: "climate" as const,
        };
      }),
    };
  }

  const index = seasonIndex[season] * 2;
  const rainfallMm = districtData[index];
  const temperatureC = districtData[index + 1];
  const stateCode = stateCodes[state];
  const ranked = crops.filter(crop => crop.states.includes(stateCode) && crop.seasons.includes(season)).map(crop => {
    let score = 50;
    const reasons = [`Included for ${state} in the sample crop list`, `Season match: ${season}`];
    if (crop.soils.some(soil => normalize(soil) === normalize(input.soilType))) {
      score += 20;
      reasons.push(`Soil matches (${input.soilType})`);
    } else reasons.push(`Soil may be less suitable; listed soils: ${crop.soils.join(", ")}`);

    const waterRatio = (0.8 * rainfallMm + extraWaterMm[input.water]) / crop.waterMm;
    if (waterRatio >= 1) { score += 15; reasons.push("Estimated water supply is enough"); }
    else if (waterRatio >= 0.7) { score += 9; reasons.push("Water supply may be slightly short"); }
    else { score += 3; reasons.push("Water supply may be short"); }

    if (rainfallMm >= crop.rainMin && rainfallMm <= crop.rainMax) { score += 8; reasons.push("Sample rainfall is within range"); }
    else { score += 2; reasons.push(`Sample rainfall is outside ${crop.rainMin}–${crop.rainMax} mm`); }
    if (temperatureC >= crop.tempMin && temperatureC <= crop.tempMax) { score += 7; reasons.push("Sample temperature is within range"); }
    else { score += 2; reasons.push(`Sample temperature is outside ${crop.tempMin}–${crop.tempMax} °C`); }

    return {
      id: `climate-${normalize(crop.name)}`,
      name: crop.name,
      score,
      category: score >= 85 ? "Strong match" : score >= 70 ? "Possible match" : "Needs consideration",
      water: `${crop.waterMm} mm total`,
      waterNeedMm: crop.waterMm,
      irrigationNeedMm: Math.max(0, Math.round(crop.waterMm - 0.8 * rainfallMm)),
      description: "",
      reasons,
      illustrative: true,
      source: "climate" as const,
    };
  }).sort((a, b) => b.score - a.score);

  return { state, district: input.district ?? "", season, rainfallMm, temperatureC, crops: ranked };
}
