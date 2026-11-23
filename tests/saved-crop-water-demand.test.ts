import assert from "node:assert/strict";
import test from "node:test";
import { savedCropWaterDemand } from "../src/lib/saved-crop-water-demand";
import { loadOfflineForecast } from "../src/lib/open-meteo";
import { fieldRain } from "../src/lib/field-advice";
import { getOfflineCropAdvice } from "../src/lib/crop-advice-catalog";

const input = {
  crop: "Wheat", state: "Andaman And Nicobar Islands", district: "North And Middle Andaman",
  area: 1, areaUnit: "hectare", growthStage: "Flowering", soil: "Loamy Soil", method: "Drip Irrigation",
};
const today = "2026-01-05";

test("saved crop demand uses model ETo for the matching day and falls back to the district normal", () => {
  const { demo, ...forecast } = loadOfflineForecast();
  assert.equal(demo, true);
  forecast.daily.time = [today];
  forecast.daily.et0_fao_evapotranspiration = [4];
  const live = savedCropWaterDemand(input, forecast, today);
  assert.equal(live?.mode, "live");
  assert.equal(live?.min, 4 * 1.15);
  const sample = { ...forecast, demo };
  assert.equal(fieldRain(sample, today), null);
  const offline = savedCropWaterDemand(input, sample, today);
  assert.equal(offline?.mode, "offline");
  assert.ok(Math.abs((offline?.min ?? 0) - 4.485) < 1e-10);
  assert.equal(savedCropWaterDemand({ ...input, district: "Unknown" }, null, today), null);
  assert.equal(savedCropWaterDemand({ ...input, growthStage: "Vegetative" }, forecast, today), null);
});

test("legacy illustrative crop examples omit numerical scores and water needs", () => {
  const result = getOfflineCropAdvice("Bihar", "Saran", "Alluvial");
  assert.ok(result.seasons.length > 0);
  assert.ok(result.seasons.every(season => season.crops.every(crop => crop.score === null && crop.waterNeedMm === null)));
});
