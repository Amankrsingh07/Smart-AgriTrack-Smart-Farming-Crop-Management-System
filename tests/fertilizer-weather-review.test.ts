import test from "node:test";
import assert from "node:assert/strict";
import { fertilizerForecastForDate, fertilizerRainReview } from "../src/lib/fertilizer-weather-review";
import { loadOfflineForecast } from "../src/lib/open-meteo";
import { soilOcrSettings } from "../src/lib/soil-ocr-settings";

test("weather review requires rain on the planned date and never uses another day's estimate", () => {
  const forecast = loadOfflineForecast();
  delete forecast.demo; // Provider-shaped fixture.
  forecast.daily = { ...forecast.daily, time: ["2026-11-18", "2026-11-19", "2026-11-20"], precipitation_sum: [null, 0, 2.5], precipitation_probability_max: [90, 50, 70] };
  assert.equal(fertilizerRainReview(forecast, "2026-11-18", "2026-11-18"), null);
  assert.equal(fertilizerRainReview(forecast, "2026-11-19", "2026-11-18"), null);
  assert.deepEqual(fertilizerRainReview(forecast, "2026-11-20", "2026-11-18"), { rain: 2.5, probability: 70 });
  assert.equal(fertilizerRainReview(forecast, "2026-11-20", "2026-11-21"), null);
});

test("planned activity weather preserves zero rainfall and missing measurements", () => {
  const forecast = loadOfflineForecast();
  delete forecast.demo; // Provider-shaped fixture.
  forecast.daily = { ...forecast.daily, time: ["2026-11-20"], precipitation_sum: [0],
    precipitation_probability_max: [null], temperature_2m_max: [32], wind_speed_10m_max: [19] };
  assert.deepEqual(fertilizerForecastForDate(forecast, "2026-11-20", "2026-11-20"),
    { rain: 0, probability: null, temperature: 32, wind: 19 });
  assert.equal(fertilizerForecastForDate(forecast, "2026-11-21", "2026-11-20"), null);
});

test("OCR page counts are bounded and only configured language codes reach the OCR process", () => {
  assert.deepEqual(soilOcrSettings("99", "hi"), { pages: 12, language: "hin" });
  assert.deepEqual(soilOcrSettings("0", "ta"), { pages: 1, language: "tam" });
  assert.deepEqual(soilOcrSettings("-1", "--help"), { pages: 4, language: "eng" });
});

test("demo weather is excluded from fertilizer risk review", () => {
  const demo = loadOfflineForecast();
  assert.equal(fertilizerForecastForDate(demo, demo.daily.time[0], demo.daily.time[0]), null);
});
