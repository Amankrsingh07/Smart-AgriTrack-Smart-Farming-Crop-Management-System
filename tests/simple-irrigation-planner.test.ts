import assert from "node:assert/strict";
import test from "node:test";
import { calculateSimpleIrrigation } from "../src/lib/simple-irrigation-planner";

const base = {
  crop: "Wheat", state: "Andaman And Nicobar Islands", district: "North And Middle Andaman",
  area: 1, areaUnit: "hectare", growthStage: "Flowering", soil: "Loamy Soil", method: "Drip Irrigation",
  month: 1,
};
const measured = { fieldCapacityPercent: 32, wiltingPointPercent: 15, currentPercent: 22, rootZoneDepthM: 0.6 };

test("Millet vegetative ETc uses the cited development-stage Kc and a water balance needs measured soil values", () => {
  const missing = calculateSimpleIrrigation({ ...base, crop: "Millet", growthStage: "Vegetative" });
  assert.equal(missing.cropDemandAvailable, true);
  assert.equal(missing.kcMin, 0.7);
  assert.equal(missing.etcMinMmPerDay, 2.73);
  assert.equal(missing.available, false);
  assert.equal(missing.grossRequirementLitersMin, undefined);
  assert.match(missing.source.crop, /Table 8/);
  const withMeasurements = calculateSimpleIrrigation({ ...base, crop: "Millet", growthStage: "Vegetative", moisture: measured });
  assert.equal(withMeasurements.available, true);
  assert.ok((withMeasurements.grossRequirementLitersMax ?? 0) >= (withMeasurements.grossRequirementLitersMin ?? 0));
});

test("Barley configured stage coefficients produce ETc and a measured root-zone estimate", () => {
  const result = calculateSimpleIrrigation({ ...base, crop: "Barley", moisture: measured });
  assert.equal(result.available, true);
  assert.equal(result.kcMin, 1.15);
  assert.ok(Math.abs((result.etcMinMmPerDay ?? 0) - 4.485) < 1e-10);
  assert.match(result.source.crop, /Barley\/Oats\/Wheat/);
  assert.match(result.source.root, /Table 22/);
});

test("Wheat flowering stage uses its FAO-56 Kc and measured soil water balance", () => {
  const result = calculateSimpleIrrigation({ ...base, moisture: measured });
  assert.equal(result.available, true);
  assert.ok(Math.abs((result.etcMinMmPerDay ?? 0) - 4.485) < 1e-10);
  assert.ok((result.tawMm ?? 0) > 0);
  assert.ok((result.depletionMm ?? 0) > 0);
  assert.equal(result.rainfallCreditMm, 0);
});

test("Rice exposes crop-demand context but never an ordinary crop dose", () => {
  const result = calculateSimpleIrrigation({ ...base, crop: "Rice", moisture: measured });
  assert.equal(result.cropDemandAvailable, true);
  assert.equal(result.available, false);
  assert.equal(result.grossRequirementLitersMin, undefined);
  assert.ok(result.missing.some(item => item.includes("ponding, seepage, and percolation")));
});

test("missing crop-stage Kc withholds ETc rather than averaging or inventing a value", () => {
  const result = calculateSimpleIrrigation({ ...base, growthStage: "Vegetative", moisture: measured });
  assert.equal(result.cropDemandAvailable, false);
  assert.equal(result.etcMinMmPerDay, undefined);
  assert.equal(result.available, false);
  assert.ok(result.missing.some(item => item.includes("coefficient")));
});

test("missing district/month ETo returns Insufficient Data and no estimate", () => {
  const result = calculateSimpleIrrigation({ ...base, district: "Unconfigured District", moisture: measured });
  assert.equal(result.available, false);
  assert.equal(result.etcMinMmPerDay, undefined);
  assert.ok(result.missing.some(item => item.includes("Insufficient Data")));
});

test("offline ETo clearly identifies the historical climate period and dataset version", () => {
  const result = calculateSimpleIrrigation({ ...base, moisture: measured, weatherMode: "offline" });
  assert.match(result.source.climate, /1961-1990/);
  assert.match(result.source.climateVersion, /v1\.0/);
  assert.ok(result.source.links.every(item => item.label && item.url.startsWith("https://") && item.parameter && item.verificationStatus));
});

test("depletion below RAW produces no irrigation recommendation and zero application", () => {
  const result = calculateSimpleIrrigation({ ...base, moisture: { ...measured, currentPercent: 32 } });
  assert.equal(result.available, true);
  assert.equal(result.irrigationDue, false);
  assert.equal(result.netRequirementMm, 0);
  assert.equal(result.grossRequirementLitersMin, 0);
  assert.equal(result.grossRequirementLitersMax, 0);
});

test("crop-specific depletion fraction controls the Potato irrigation threshold", () => {
  const result = calculateSimpleIrrigation({
    ...base,
    crop: "Potato",
    state: "Bihar",
    district: "Saran",
    month: 11,
    areaUnit: "acre",
    moisture: { fieldCapacityPercent: 30, wiltingPointPercent: 10, currentPercent: 21, rootZoneDepthM: 0.6 },
  });
  assert.equal(result.available, true);
  assert.equal(result.irrigationDue, true);
  assert.ok(Math.abs((result.depletionMm ?? 0) - 54) < 1e-9);
  assert.ok(Math.abs((result.allowableDepletionMm ?? 0) - 51.648) < 1e-9);
});

test("published method efficiencies produce a gross water range", () => {
  const result = calculateSimpleIrrigation({
    ...base,
    state: "Bihar",
    district: "Saran",
    month: 11,
    areaUnit: "acre",
    method: "Sprinkler Irrigation",
    moisture: { fieldCapacityPercent: 30, wiltingPointPercent: 10, currentPercent: 10, rootZoneDepthM: 0.6 },
  });
  assert.equal(result.available, true);
  assert.ok(Math.abs((result.netRequirementMm ?? 0) - 120) < 1e-9);
  assert.ok(Math.abs((result.grossRequirementLitersMin ?? 0) - (120 * 4046.856 / 0.7)) < 1e-6);
  assert.ok(Math.abs((result.grossRequirementLitersMax ?? 0) - (120 * 4046.856 / 0.5)) < 1e-6);
});

test("live mode uses supplied current-day model ETo and never falls back to offline ETo", () => {
  const result = calculateSimpleIrrigation({ ...base, moisture: measured, weatherMode: "live", liveEt0MmDay: 5, liveWeatherDate: "2026-11-06" });
  assert.equal(result.available, true);
  assert.equal(result.et0MmPerDay, 5);
  assert.equal(result.etcMinMmPerDay, 5.75);
  assert.match(result.source.climate, /Open-Meteo current-day model/);
  const unavailable = calculateSimpleIrrigation({ ...base, moisture: measured, weatherMode: "live" });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.et0MmPerDay, undefined);
  assert.ok(unavailable.missing.some(item => item.includes("No historical value was substituted")));
});

test("forecast or historical rainfall is not credited to the root-zone balance", () => {
  const result = calculateSimpleIrrigation({ ...base, moisture: measured });
  assert.equal(result.rainfallCreditMm, 0);
  assert.match(result.rainfallNote, /forecast\/model rainfall and historical climate normals are shown separately/);
});

test("invalid soil moisture ordering withholds the water estimate", () => {
  const result = calculateSimpleIrrigation({ ...base, moisture: { ...measured, currentPercent: 12 } });
  assert.equal(result.available, false);
  assert.equal(result.grossRequirementLitersMin, undefined);
  assert.ok(result.missing.some(item => item.includes("field capacity > current moisture")));
});

test("complete offline water balances resolve Chhapra to Saran for Wheat, Barley, and Millet", () => {
  for (const [crop, growthStage] of [["Wheat", "Flowering"], ["Barley", "Flowering"], ["Millet", "Vegetative"]]) {
    const result = calculateSimpleIrrigation({ ...base, crop, growthStage, state: "Bihar", district: "Chhapra", month: 6, moisture: measured });
    assert.equal(result.available, true, `${crop} should have a complete Saran reference calculation`);
    assert.ok((result.et0MmPerDay ?? 0) > 0);
    assert.ok((result.etcMinMmPerDay ?? 0) > 0);
    assert.ok((result.grossRequirementLitersMin ?? 0) >= 0);
    assert.match(result.source.climateLocation, /Chhapra resolved as Saran, Bihar/);
  }
});
