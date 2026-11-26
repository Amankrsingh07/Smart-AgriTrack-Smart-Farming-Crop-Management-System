import test from "node:test";
import assert from "node:assert/strict";
import {
  geocodeIndianDistrict,
  loadOpenMeteoForecast,
} from "../src/lib/open-meteo";

const response = (payload: unknown, ok = true) => ({
  ok,
  json: async () => payload,
});
const validPayload = {
  current: {
    time: "2026-11-03T09:00",
    temperature_2m: 20,
    relative_humidity_2m: 50,
    precipitation: 0,
    wind_speed_10m: 5,
    weather_code: 1,
  },
  daily: {
    time: ["2026-11-03"],
    precipitation_sum: [0],
    precipitation_probability_max: [0],
    temperature_2m_max: [25],
    temperature_2m_min: [15],
    et0_fao_evapotranspiration: [4.2],
    wind_speed_10m_max: [8],
    weather_code: [1],
  },
  timezone: "Asia/Kolkata",
};

test("Open-Meteo request uses supplied farm coordinates, ET0 and forecast rainfall variables", async () => {
  const original = globalThis.fetch;
  let requested = "";
  globalThis.fetch = (async (input) => {
    requested = String(input);
    return response(validPayload) as Response;
  }) as typeof fetch;
  try {
    const result = await loadOpenMeteoForecast(28.6, 77.2);
    const url = new URL(requested);
    assert.equal(url.searchParams.get("latitude"), "28.6");
    assert.equal(url.searchParams.get("longitude"), "77.2");
    assert.match(
      url.searchParams.get("daily") ?? "",
      /et0_fao_evapotranspiration/,
    );
    assert.match(url.searchParams.get("daily") ?? "", /precipitation_sum/);
    assert.equal(url.searchParams.get("timezone"), "auto");
    assert.equal(url.searchParams.get("precipitation_unit"), "mm");
    assert.equal(result.daily.et0_fao_evapotranspiration?.[0], 4.2);
    assert.equal(url.searchParams.get("past_days"), null);
    await loadOpenMeteoForecast(28.6, 77.2, { pastDays: 14 });
    assert.equal(new URL(requested).searchParams.get("past_days"), "14");
  } finally {
    globalThis.fetch = original;
  }
});

test("invalid daily response is rejected", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    response({
      ...validPayload,
      daily: { ...validPayload.daily, precipitation_sum: [] },
    })) as unknown as typeof fetch;
  try {
    await assert.rejects(
      loadOpenMeteoForecast(28.6, 77.2),
      /invalid daily forecast/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("Open-Meteo upstream failures are surfaced", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    response({}, false)) as unknown as typeof fetch;
  try {
    await assert.rejects(loadOpenMeteoForecast(28.6, 77.2), /unavailable/);
  } finally {
    globalThis.fetch = original;
  }
});

test("district geocoding never falls back to a result in the wrong state", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    response({
      results: [
        {
          id: 1,
          name: "Rampur",
          latitude: 28.8,
          longitude: 79.0,
          admin1: "Uttar Pradesh",
          country_code: "IN",
        },
      ],
    })) as unknown as typeof fetch;
  try {
    assert.equal(
      await geocodeIndianDistrict("Rampur", "Himachal Pradesh"),
      undefined,
    );
    assert.equal(
      (await geocodeIndianDistrict("Rampur", "Uttar Pradesh"))?.admin1,
      "Uttar Pradesh",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("invalid coordinates and incomplete current readings cannot be used as provider weather", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return response({
      ...validPayload,
      current: { ...validPayload.current, relative_humidity_2m: null },
    });
  }) as unknown as typeof fetch;
  try {
    await assert.rejects(
      loadOpenMeteoForecast(91, 77),
      /invalid weather coordinates/i,
    );
    assert.equal(calls, 0);
    await assert.rejects(
      loadOpenMeteoForecast(28.6, 77.2),
      /incomplete current conditions/i,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("crop-loss forecast cache coalesces requests and expires after four minutes", async () => {
  const { readCropLossWeather } = await import("../src/lib/crop-loss-weather");
  const original = Date.now;
  let now = original();
  let loads = 0;
  const load = async () => {
    loads++;
    return validPayload;
  };
  Date.now = () => now;
  try {
    const [first, second] = await Promise.all([
      readCropLossWeather(27.31, 76.41, true, load),
      readCropLossWeather(27.31, 76.41, true, load),
    ]);
    assert.equal(first.source, "Live API");
    assert.equal(second.source, "Cached");
    assert.equal(loads, 1);
    now += 4 * 60_000;
    assert.equal(
      (await readCropLossWeather(27.31, 76.41, true, load)).source,
      "Live API",
    );
    assert.equal(loads, 2);
  } finally {
    Date.now = original;
  }
});
