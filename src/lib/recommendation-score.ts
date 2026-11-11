export type WaterRank = "LOW" | "MEDIUM" | "HIGH";
const waterRank: Record<WaterRank, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

// Transparent comparative score: location/season 40, soil +25/-15,
// water match +20 or -8 per level away. It is not a scientific guarantee.
export function scoreSuitability(soilCompatible: boolean, requiredWater: WaterRank, availableWater: WaterRank) {
  const reasons: string[] = ["Season and state match the stored location suitability entry."];
  let score = 40;
  if (soilCompatible) {
    score += 25;
    reasons.push("Selected soil is listed as compatible in the crop profile.");
  } else {
    score -= 15;
    reasons.push("Selected soil is not in this crop's configured soil list.");
  }
  const difference = Math.abs(waterRank[requiredWater] - waterRank[availableWater]);
  if (difference === 0) {
    score += 20;
    reasons.push("Configured water need matches your available water.");
  } else {
    score -= difference * 8;
    reasons.push(`Water availability differs from the configured ${requiredWater.toLowerCase()} requirement.`);
  }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}
