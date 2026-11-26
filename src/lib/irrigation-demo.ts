import {
  calculateSimpleIrrigation,
  type SimplePlannerInput,
} from "./simple-irrigation-planner";

/** Synthetic weather and field context used only by the browser's demo mode. */
export const irrigationDemo: SimplePlannerInput = {
  mode: "demo",
  crop: "Maize",
  state: "Bihar",
  district: "Saran",
  area: 1,
  areaUnit: "hectare",
  soil: "Sandy Loam",
  growthStage: "Flowering",
  method: "Drip Irrigation",
  weatherMode: "live",
  month: 5,
  moistureMeasuredDate: "2025-05-01",
  calculationDate: "2025-05-04",
  baselineAtFieldCapacity: true,
  liveEt0MmDay: 5,
  liveWeatherDate: "2025-05-04",
  dailyWeather: [
    { date: "2025-05-02", et0Mm: 5, rainMm: 0 },
    { date: "2025-05-03", et0Mm: 6, rainMm: 2 },
    { date: "2025-05-04", et0Mm: 5, rainMm: 0 },
  ],
};

export function calculateIrrigationDemo() {
  const result = calculateSimpleIrrigation(irrigationDemo);
  return {
    ...result,
    source: {
      ...result.source,
      climate: "Synthetic daily weather for academic demonstration.",
      climateSourceUrl: undefined,
      climateVerification: "Synthetic demo",
      climateVersion: "Built-in demo fixture",
    },
    rainfallNote:
      "Synthetic rainfall is credited up to available root-zone storage.",
  };
}
