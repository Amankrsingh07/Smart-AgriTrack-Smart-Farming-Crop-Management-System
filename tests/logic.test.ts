import test from "node:test";
import assert from "node:assert/strict";
import { Prisma, WaterMeasure, type CropWaterStage } from "@prisma/client";
import { canSellQuantity, estimatedProfitLoss, saleRevenue } from "../src/lib/finance";
import { scoreSuitability } from "../src/lib/recommendation-score";
import { exactFullSeasonEtc, waterConfigurationMessage, waterValues } from "../src/lib/crop-water";
import indiaLocations from "../src/data/india-locations.json";

test("suitability scoring rewards matching configured soil and water", () => {
  const result = scoreSuitability(true, "MEDIUM", "MEDIUM");
  assert.equal(result.score, 85);
  assert.equal(result.reasons.length, 3);
});

test("suitability scoring lowers incompatible soil and water", () => {
  const result = scoreSuitability(false, "HIGH", "LOW");
  assert.equal(result.score, 9);
  assert.ok(result.reasons.some((reason) => reason.includes("not in this crop")));
});

test("sales revenue uses decimal arithmetic", () => {
  assert.equal(saleRevenue("12.5", "18.75").toFixed(2), "234.38");
});

test("sales cannot exceed unsold harvest", () => {
  const production = new Prisma.Decimal("50.000");
  const sold = [new Prisma.Decimal("20.000")];
  assert.equal(canSellQuantity(production, sold, new Prisma.Decimal("30.000")), true);
  assert.equal(canSellQuantity(production, sold, new Prisma.Decimal("30.001")), false);
});

test("profit or loss subtracts recorded expenses from revenue", () => {
  assert.equal(estimatedProfitLoss(new Prisma.Decimal("1200.50"), new Prisma.Decimal("875.25")).toFixed(2), "325.25");
  assert.equal(estimatedProfitLoss(new Prisma.Decimal("100"), new Prisma.Decimal("180")).toFixed(2), "-80.00");
});

test("crop water profiles keep ETc, rainfall, and irrigation measurements distinct", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const makeStage = (waterMeasure: WaterMeasure, value: number): CropWaterStage => ({
    id: `${waterMeasure}-id`, cropId: "field-pea", cropSeasonId: "field-pea-rabi", stageName: "Full season",
    startDay: null, endDay: null, cropCoefficient: null, rootDepthMeters: null, allowableDepletionFraction: null, publicationDate: null, verifiedAt: null, isFullSeasonTotal: true, waterMeasure,
    waterRequirementMm: new Prisma.Decimal(value), minimumWaterRequirementMm: null, maximumWaterRequirementMm: null,
    source: "Research source", sourceUrl: "https://example.org/source", notes: null, dataStatus: "VERIFIED", geographicScope: null, publicationTitle: null, publicationYear: null, tableReference: null, irrigationMethod: null, supportingSource: null, supportingSourceUrl: null, createdAt: now, updatedAt: now,
  });
  const values = waterValues([
    makeStage(WaterMeasure.CROP_ETC, 221),
    makeStage(WaterMeasure.EFFECTIVE_RAINFALL, 59),
    makeStage(WaterMeasure.IRRIGATION_REQUIREMENT, 150),
  ]);
  assert.equal(exactFullSeasonEtc(values), 221);
  assert.deepEqual(values.map(value => value.measure), ["Crop ETc", "Effective rainfall", "Irrigation requirement"]);
  assert.deepEqual(values.map(value => value.valueMm), ["221", "59", "150"]);
});

test("aggregate peas and beans history stays unconfigured without an exact crop profile", () => {
  const message = waterConfigurationMessage(undefined, "RABI", [], "Peas & beans (Pulses)", false);
  assert.match(message ?? "", /combined historical crop group/);
  assert.match(message ?? "", /exact species and RABI water profile/);
});

test("qualitative water categories do not masquerade as millimetre requirements", () => {
  const message = waterConfigurationMessage("low", "KHARIF", []);
  assert.match(message ?? "", /Only the qualitative low water category/);
  assert.match(message ?? "", /No KHARIF ETc or irrigation depth in mm/);
});

test("India location reference contains all states, UTs and bundled districts", () => {
  const unionTerritoryCodes = new Set(["1", "4", "7", "31", "34", "35", "37", "38"]);
  assert.equal(indiaLocations.states.length, 36);
  assert.equal(indiaLocations.states.filter(state => unionTerritoryCodes.has(state.code)).length, 8);
  assert.equal(indiaLocations.states.length - 8, 28);
  assert.equal(indiaLocations.districts.length, 784);
  assert.ok(indiaLocations.districts.every(district => indiaLocations.states.some(state => state.code === district.stateCode)));
});

