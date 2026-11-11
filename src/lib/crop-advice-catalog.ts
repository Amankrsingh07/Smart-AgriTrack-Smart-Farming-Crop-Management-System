export type CropAdvice = {
  seasons: { season: string; crops: { name: string; score: number; waterNeedMm: string; fertilizer: string; recommendation: string }[] }[];
  note: string;
};

export const fertilizerGuidance = "Apply based on soil test; follow local KVK guidance for nitrogen-phosphorus ratios.";

const catalog = [
  { season: "Kharif", crops: [["Rice (Paddy)", "1200", "High water demand; verify local water availability."], ["Maize", "550", "Use a locally recommended variety and planting window."], ["Moong", "300", "Confirm local suitability."]] },
  { season: "Rabi", crops: [["Wheat", "450", "Common winter cereal; follow local sowing guidance."], ["Mustard", "250", "Match variety to local conditions."], ["Chickpea (Gram)", "300", "Avoid waterlogged fields."]] },
  { season: "Zaid", crops: [["Moong", "300", "Short-season pulse; confirm irrigation access."], ["Watermelon", "400", "Requires warm conditions and good drainage."], ["Cucumber", "350", "Confirm local variety and market before planting."]] },
];

export function getOfflineCropAdvice(state: string, district: string, soilType: string): CropAdvice {
  const loamy = soilType.toLowerCase().includes("loam");
  const seasons = catalog.map(({ season, crops }) => ({ season, crops: crops.map(([name, waterNeedMm, recommendation], i) => ({
    name,
    score: Math.max(45, 78 - i * 8 + (loamy ? 5 : 0)),
    waterNeedMm,
    fertilizer: fertilizerGuidance,
    recommendation,
  })) }));
  return { seasons, note: `Offline rule-based examples for ${district}, ${state} and ${soilType}. Demonstration suggestions only; scores are comparative and are not district-verified prescriptions.` };
}
