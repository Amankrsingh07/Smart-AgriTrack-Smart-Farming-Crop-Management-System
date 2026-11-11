import reference from "@/data/soil-health-reference.json";

export type SoilHealthInput = {
  state: string;
  district: string;
  crop: string;
  growthStage: string;
  soilType: string;
  nitrogenKgHa: number;
  phosphorusKgHa: number;
  potassiumKgHa: number;
  soilPh?: number;
};

export type SoilRating = { name: string; value: number; unit: string; rating: string; range: string; guidance: string };

function classify(value: number, lowBelow: number, mediumThrough: number, highThrough?: number) {
  if (value < lowBelow) return { rating: "Low", range: `< ${lowBelow}` };
  if (value <= mediumThrough) return { rating: "Medium", range: `${lowBelow}–${mediumThrough}` };
  if (highThrough !== undefined) {
    if (value <= highThrough) return { rating: "High", range: `${mediumThrough}–${highThrough}` };
    return { rating: "Very high", range: `> ${highThrough}` };
  }
  return { rating: "High", range: `> ${mediumThrough}` };
}

function nutrientGuidance(name: string, rating: string, crop: string, stage: string) {
  if (rating === "Low") {
    if (name === "Nitrogen" && stage === "Vegetative") return `The screening class is low. For ${crop} at the vegetative stage, check the crop-specific nitrogen top-dressing timing and rate on the issued Soil Health Card or with your KVK before applying.`;
    return `The screening class is low. Ask your soil lab or KVK whether a ${name.toLowerCase()} correction is advised for ${crop} at the ${stage.toLowerCase()} stage; use the issued Soil Health Card rate.`;
  }
  if (rating === "Very high") return `The screening class is very high. Do not add extra ${name.toLowerCase()} solely from this screen; confirm the crop schedule with the soil lab or KVK.`;
  if (rating === "High") return `The screening class is high. Avoid an extra ${name.toLowerCase()} application based only on this screen; follow the crop- and stage-specific Soil Health Card schedule.`;
  return `The screening class is medium. Follow the crop- and stage-specific recommendation on the issued Soil Health Card; this soil rating is not a fertilizer dose.`;
}

export function analyzeSoil(input: SoilHealthInput) {
  const n = classify(input.nitrogenKgHa, reference.nutrients.nitrogen.lowBelow, reference.nutrients.nitrogen.mediumThrough);
  const p = classify(input.phosphorusKgHa, reference.nutrients.phosphorus.lowBelow, reference.nutrients.phosphorus.mediumThrough, reference.nutrients.phosphorus.highThrough);
  const k = classify(input.potassiumKgHa, reference.nutrients.potassium.lowBelow, reference.nutrients.potassium.mediumThrough, reference.nutrients.potassium.highThrough);
  const nutrients: SoilRating[] = [
    { name: "Nitrogen (N)", value: input.nitrogenKgHa, unit: "kg/ha", ...n, guidance: nutrientGuidance("Nitrogen", n.rating, input.crop, input.growthStage) },
    { name: "Phosphorus (P)", value: input.phosphorusKgHa, unit: "kg/ha", ...p, guidance: nutrientGuidance("Phosphorus", p.rating, input.crop, input.growthStage) },
    { name: "Potassium (K)", value: input.potassiumKgHa, unit: "kg/ha", ...k, guidance: nutrientGuidance("Potassium", k.rating, input.crop, input.growthStage) },
  ];
  const ph = input.soilPh === undefined ? null : {
    value: input.soilPh,
    rating: input.soilPh < 4 ? "Extremely acidic" : input.soilPh < 5 ? "Strongly acidic" : input.soilPh < 6 ? "Moderately acidic" : input.soilPh < 7 ? "Slightly acidic" : input.soilPh === 7 ? "Neutral" : input.soilPh <= 8 ? "Moderately alkaline" : input.soilPh > 8.5 ? "Strongly alkaline" : "Alkaline; confirm local lab rating",
    guidance: "pH affects nutrient availability and varies by crop. Confirm crop-specific interpretation and any amendment with your Soil Health Card or local soil lab; this app does not calculate lime or gypsum rates.",
  };
  return {
    location: `${input.district}, ${input.state}`,
    crop: input.crop,
    growthStage: input.growthStage,
    soilType: input.soilType,
    nutrients,
    ph,
    note: "Offline screening based on general classes in the Soil Health Card Portal Teacher's Manual. State, district and soil type are recorded for context; these screening bands are not location- or soil-specific. Soil laboratory methods and state ratings can differ. This report does not prescribe fertilizer products or quantities; use the issued crop-specific Soil Health Card recommendation.",
    source: reference.meta,
  };
}
