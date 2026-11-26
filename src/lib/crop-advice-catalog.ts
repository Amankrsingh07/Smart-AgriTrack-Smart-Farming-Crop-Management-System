export type CropAdvice = {
  seasons: {
    season: string;
    crops: {
      name: string;
      score: null;
      waterNeedMm: null;
      fertilizer: string;
      recommendation: string;
    }[];
  }[];
  note: string;
};

export const fertilizerGuidance =
  "Apply based on soil test; follow local KVK guidance for nitrogen-phosphorus ratios.";

const catalog = [
  {
    season: "Kharif",
    crops: [
      ["Rice (Paddy)", "High water demand; verify local water availability."],
      ["Maize", "Use a locally recommended variety and planting window."],
      ["Moong", "Confirm local suitability."],
    ],
  },
  {
    season: "Rabi",
    crops: [
      ["Wheat", "Common winter cereal; follow local sowing guidance."],
      ["Mustard", "Match variety to local conditions."],
      ["Chickpea (Gram)", "Avoid waterlogged fields."],
    ],
  },
  {
    season: "Zaid",
    crops: [
      ["Moong", "Short-season pulse; confirm irrigation access."],
      ["Watermelon", "Requires warm conditions and good drainage."],
      ["Cucumber", "Confirm local variety and market before planting."],
    ],
  },
];

export function getOfflineCropAdvice(
  state: string,
  district: string,
  soilType: string,
): CropAdvice {
  const seasons = catalog.map(({ season, crops }) => ({
    season,
    crops: crops.map(([name, recommendation]) => ({
      name,
      score: null,
      waterNeedMm: null,
      fertilizer: fertilizerGuidance,
      recommendation,
    })),
  }));
  return {
    seasons,
    note: `Offline rule-based examples for ${district}, ${state} and ${soilType}. These examples are illustrative. Field-specific suitability and water demand require more evidence.`,
  };
}
