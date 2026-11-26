import test from "node:test";
import assert from "node:assert/strict";
import {
  WeatherForecastError,
  forecastNetworkFailure,
  weatherFailureDetails,
} from "../src/lib/weather-diagnostics";
import { loadOpenMeteoForecast } from "../src/lib/open-meteo";
import { preventionSoilContext } from "../src/lib/crop-loss-soil-context";
import {
  officialBulletinDetails,
  accessibleOfficialAdvisories,
} from "../src/lib/crop-loss-advisories";
import {
  establishmentRainAlerts,
  maizeEstablishmentGuidance,
} from "../src/lib/crop-loss-prevention";
import { analyzeSoil, type SoilHealthInput } from "../src/lib/soil-health";
const context = {
  fieldId: "TEST-field",
  cropId: "TEST-maize",
  cropCycleId: "TEST-cycle",
  crop: "Maize",
};
const now = new Date("2026-11-14T09:00:00Z");
const input: SoilHealthInput = {
  mode: "REAL",
  state: "Bihar",
  district: "Saran",
  crop: "Maize",
  growthStage: "Establishment",
  soilType: "Alluvial",
  fieldId: context.fieldId,
  cropId: context.cropId,
  cropCycleId: context.cropCycleId,
  sampleDate: "2026-10-01",
  nitrogenKgHa: 240,
};
const record = (value: SoilHealthInput) => ({
  id: "TEST-report",
  input: value,
  result: analyzeSoil(value),
  sampleDate: value.sampleDate ? new Date(value.sampleDate) : null,
  createdAt: new Date("2026-10-02"),
});
test("weather failures provide exact sanitized reasons and actionable recovery steps", () => {
  assert.equal(
    forecastNetworkFailure({ cause: { code: "ENOTFOUND" } }).code,
    "DNS_FAILURE",
  );
  assert.equal(
    forecastNetworkFailure({ name: "TimeoutError" }).code,
    "TIMEOUT",
  );
  assert.equal(
    forecastNetworkFailure({ cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }).code,
    "TIMEOUT",
  );
  assert.equal(
    forecastNetworkFailure(
      new Error("secret provider token must not be displayed"),
    ).code,
    "NETWORK_FAILURE",
  );
  const rate = weatherFailureDetails(
    new WeatherForecastError("RATE_LIMITED", "HTTP 429", 429),
  );
  assert.equal(rate.httpStatus, 429);
  assert.match(rate.action, /Wait/);
  assert.equal(
    weatherFailureDetails(new Error("private internal details")).code,
    "INVALID_RESPONSE",
  );
  assert.ok(
    !weatherFailureDetails(
      new Error("private internal details"),
    ).message.includes("private"),
  );
  assert.equal(
    weatherFailureDetails(
      new WeatherForecastError("MISSING_COORDINATES", "missing"),
    ).href,
    "/farms",
  );
});
test("forecast loader preserves DNS, timeout, rate-limit and invalid JSON diagnostics", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      throw Object.assign(new Error("fetch failed"), {
        cause: { code: "ENOTFOUND" },
      });
    }) as typeof fetch;
    await assert.rejects(
      loadOpenMeteoForecast(28.6, 77.2),
      (error) =>
        error instanceof WeatherForecastError && error.code === "DNS_FAILURE",
    );
    globalThis.fetch = (async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    }) as typeof fetch;
    await assert.rejects(
      loadOpenMeteoForecast(28.6, 77.2),
      (error) =>
        error instanceof WeatherForecastError && error.code === "TIMEOUT",
    );
    globalThis.fetch = (async () =>
      new Response("rate limit", { status: 429 })) as typeof fetch;
    await assert.rejects(
      loadOpenMeteoForecast(28.6, 77.2),
      (error) =>
        error instanceof WeatherForecastError &&
        error.code === "RATE_LIMITED" &&
        error.httpStatus === 429,
    );
    globalThis.fetch = (async () =>
      new Response("not JSON", { status: 200 })) as typeof fetch;
    await assert.rejects(
      loadOpenMeteoForecast(28.6, 77.2),
      (error) =>
        error instanceof WeatherForecastError &&
        error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("missing, synthetic and other-crop soil reports remain distinct with a guided owned-context link", () => {
  assert.equal(
    preventionSoilContext([], context, now).issues[0].code,
    "NO_FIELD_REPORT",
  );
  const demo = record({ ...input, mode: "DEMO", synthetic: true });
  assert.equal(
    preventionSoilContext([demo], context, now).issues[0].code,
    "NO_REAL_REPORT",
  );
  const wheat = record({
    ...input,
    crop: "Wheat",
    cropId: "TEST-wheat",
    cropCycleId: "TEST-wheat-cycle",
  });
  const result = preventionSoilContext([wheat], context, now);
  assert.equal(result.selected, null);
  assert.equal(result.otherCropReports, 1);
  assert.equal(result.issues[0].code, "CROP_LINK_MISMATCH");
});
test("matching partial reports expose actual missing metadata without replacing readings", () => {
  const sample = record(input),
    before = JSON.stringify(sample);
  const result = preventionSoilContext([sample], context, now);
  assert.equal(result.selected?.id, sample.id);
  assert.ok(result.issues.some((issue) => issue.code === "laboratoryName"));
  assert.ok(result.issues.some((issue) => issue.code === "nitrogenMethod"));
  assert.ok(
    result.issues.some((issue) => issue.code === "missing:phosphorusKgHa"),
  );
  assert.ok(result.issues.some((issue) => issue.code === "missing:soilPh"));
  assert.equal(JSON.stringify(sample), before);
  const undated = record({ ...input, sampleDate: undefined });
  assert.equal(preventionSoilContext([undated], context, now).selected, null);
  assert.ok(
    preventionSoilContext([undated], context, now).issues.some(
      (issue) => issue.code === "MISSING_SAMPLE_DATE",
    ),
  );
  const future = record({ ...input, sampleDate: "2027-01-01" });
  assert.ok(
    preventionSoilContext([future], context, now).issues.some(
      (issue) => issue.code === "FUTURE_SAMPLE_DATE",
    ),
  );
});
test("soil source restrictions remain visible even when measurements and lab metadata are complete", () => {
  const sample = record({
    ...input,
    laboratoryName: "TEST ONLY unit fixture",
    labReferenceConfirmed: true,
    referenceStandardId: "BIHAR_CSTL_GOI_2011",
    nutrientUnit: "kg/ha",
    nitrogenMethod: "ALKALINE_KMNO4_N",
    phosphorusKgHa: 18,
    phosphorusBasis: "P",
    phosphorusMethod: "OLSEN_P",
    potassiumKgHa: 150,
    potassiumBasis: "K",
    potassiumMethod: "NEUTRAL_1N_NH4OAC_K",
    organicCarbonPercent: 0.55,
    organicCarbonMethod: "WALKLEY_BLACK_OC",
    soilPh: 6.8,
    phMethod: "WATER_1_2_5",
  });
  const result = preventionSoilContext([sample], context, now);
  assert.ok(
    result.issues.some((issue) => /Olsen|alkaline/.test(issue.message)),
  );
  assert.equal(sample.result.nutrients[1].rating, "Unknown");
});
test("historical, undated, today and future bulletin filename dates never establish current validity", () => {
  const old = officialBulletinDetails(
    "https://icar-crida.res.in/WDU/2026/SEP_2026/NAAS-Bulletin-07-September-2026.pdf",
    "2026-11-14",
  );
  assert.equal(old.status, "HISTORICAL");
  assert.equal(old.dateInLink, "2026-09-07");
  assert.match(old.label, /Historical bulletin/);
  assert.match(old.dateEvidence, /not independently/);
  assert.equal(
    officialBulletinDetails(
      "https://mausam.imd.gov.in/latest.pdf",
      "2026-11-14",
    ).status,
    "DATE_UNKNOWN",
  );
  assert.equal(
    officialBulletinDetails(
      "https://mausam.imd.gov.in/2026-11-14.pdf",
      "2026-11-14",
    ).status,
    "DATED_TODAY",
  );
  assert.equal(
    officialBulletinDetails(
      "https://mausam.imd.gov.in/2027-01-01.pdf",
      "2026-11-14",
    ).status,
    "FUTURE_DATE",
  );
  assert.equal(
    officialBulletinDetails(
      "https://mausam.imd.gov.in/31-February-2026.pdf",
      "2026-11-14",
    ).status,
    "DATE_UNKNOWN",
  );
});
test("official index availability retains explicit dated-link metadata and graceful failure", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        '<a href="/NAAS-Bulletin-07-September-2026.pdf">archive</a>',
      )) as typeof fetch;
    const indices = await accessibleOfficialAdvisories();
    assert.ok(
      indices.every((index) => index.available && index.bulletins.length === 1),
    );
    assert.ok(
      indices.every((index) => index.bulletins[0].dateInLink === "2026-09-07"),
    );
    globalThis.fetch = (async () =>
      new Response("unavailable", { status: 503 })) as typeof fetch;
    assert.ok(
      (await accessibleOfficialAdvisories()).every(
        (index) => !index.available && !index.bulletins.length,
      ),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("Maize establishment review uses qualitative guidance and actual forecast exposure, never a damage threshold", () => {
  assert.ok(maizeEstablishmentGuidance("Maize", "Establishment"));
  assert.equal(maizeEstablishmentGuidance("Wheat", "Establishment"), null);
  assert.equal(maizeEstablishmentGuidance("Maize", "Flowering"), null);
  const forecast = {
    crop: "Maize",
    stage: "Establishment",
    daily: {
      time: ["2026-11-14", "2026-11-15", "2026-11-20"],
      precipitation_sum: [0, 1, 50],
      precipitation_probability_max: [0, 40, 90],
    },
    fetchedAt: "2026-11-14T09:00:00Z",
  };
  const alerts = establishmentRainAlerts(forecast, "2026-11-14");
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].message, /not evidence of waterlogging/);
  assert.match(alerts[0].uncertainty, /no Bihar-specific/);
  assert.equal(
    establishmentRainAlerts({ ...forecast, demo: true }, "2026-11-14").length,
    0,
  );
});
