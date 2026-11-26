import assert from "node:assert/strict";
import { test } from "node:test";
import {
  balanceDates,
  estimateRootZone,
  projectPaddyDay,
} from "../src/lib/irrigation-estimate";
import { calculateSimpleIrrigation } from "../src/lib/simple-irrigation-planner";
import {
  calculateIrrigationDemo,
  irrigationDemo,
} from "../src/lib/irrigation-demo";

test("daily root balance applies crop demand, rainfall storage limit and completed net watering", () => {
  const dates = balanceDates("2026-05-31", "2026-06-03")!;
  const weather = dates.map((date, i) => ({
    date,
    et0Mm: 5,
    rainMm: [0, 25, 1][i],
  }));
  const input = {
    dates,
    weather,
    kc: 1.2,
    tawMm: 100,
    netWatering: [{ date: dates[2], depthMm: 2 }],
  };
  assert.deepEqual(estimateRootZone(input), {
    depletionMm: 3,
    effectiveRainfallMm: 13,
    grossRainfallMm: 26,
    elapsedDays: 3,
  });
  assert.equal(
    estimateRootZone({ ...input, weather: weather.slice(0, 2) }),
    null,
  );
  assert.equal(
    estimateRootZone({ ...input, weather: [...weather, weather[0]] }),
    null,
  );
  assert.equal(
    estimateRootZone({
      ...input,
      netWatering: [{ date: dates[2], depthMm: NaN }],
    }),
    null,
  );
  assert.equal(balanceDates("2026-02-30", "2026-03-03"), null);
  assert.equal(balanceDates("2026-06-01", "2026-06-16"), null);
  assert.equal(balanceDates("2026-06-01", "2026-06-01"), null);
});

test("estimated mode uses source-linked references and keeps field capacity baseline and weather explicit", () => {
  const input = { ...irrigationDemo, mode: "estimated" as const };
  const result = calculateSimpleIrrigation(input);
  assert.equal(result.measuredDepletionMm, undefined);
  assert.equal(result.canSaveReminder, false);
  assert.equal(result.available, true);
  assert.equal(result.estimatedSoil?.fieldCapacityPercent, 23);
  assert.equal(result.estimatedSoil?.wiltingPointPercent, 11);
  assert.equal(result.estimatedSoil?.rootDepthM, 1);
  assert.equal(result.tawMm, 120);
  assert.equal(result.effectiveRainfallMm, 2);
  assert.match(result.source.soil, /Table 19/);
  assert.match(result.source.root, /Table 22/);
  const shallow = calculateSimpleIrrigation({
    ...input,
    moisture: { rootZoneDepthM: 0.25 },
  });
  assert.equal(shallow.irrigationDue, true);
  assert.equal(shallow.netRequirementMm?.toFixed(1), "17.2");
  assert.equal(shallow.grossRequirementLitersMin?.toFixed(1), "191111.1");
  assert.equal(shallow.grossRequirementLitersMax?.toFixed(1), "215000.0");
  for (const change of [
    { baselineAtFieldCapacity: false },
    { dailyWeather: [] },
    { soil: "Alluvial" },
    { moisture: { fieldCapacityPercent: 24 } },
    { moisture: { rootZoneDepthM: 0 } },
    { growthStage: "Establishment" },
    { growthStage: "Vegetative" },
  ]) {
    const unavailable = calculateSimpleIrrigation({ ...input, ...change });
    assert.equal(unavailable.available, false);
    assert.equal(unavailable.netRequirementMm, undefined);
    assert.equal(unavailable.effectiveRainfallMm, undefined);
    assert.ok(unavailable.missing.length);
  }
  assert.equal(
    calculateSimpleIrrigation({ ...input, crop: "Chickpea (Gram)" }).kcMax,
    1,
  );
  assert.equal(
    calculateSimpleIrrigation({ ...input, crop: "Canola" }).estimatedSoil
      ?.rootDepthM,
    1,
  );
});

test("FAO development interpolation requires explicit progress and preserves measured mode", () => {
  const input = {
    ...irrigationDemo,
    mode: "measured" as const,
    growthStage: "Vegetative",
    moistureMeasuredDate: irrigationDemo.calculationDate,
    moisture: {
      fieldCapacityPercent: 23,
      wiltingPointPercent: 11,
      currentPercent: 14,
      rootZoneDepthM: 1,
    },
  };
  assert.equal(calculateSimpleIrrigation(input).available, false);
  const result = calculateSimpleIrrigation({
    ...input,
    developmentProgressPercent: 50,
  });
  assert.equal(result.kcMax, 0.75);
  assert.equal(result.available, true);
  assert.equal(result.measuredDepletionMm?.toFixed(1), "90.0");
  assert.equal(result.canSaveReminder, true);
});

test("paddy accounts for standing depth, ET, explicit loss and bund overflow without upland thresholds", () => {
  const paddy = { pondMm: 30, targetMm: 35, bundMm: 40, lossMm: 4, rainMm: 20 };
  assert.deepEqual(projectPaddyDay(paddy, 6), {
    effectiveRainfallMm: 10,
    overflowMm: 10,
    projectedPondMm: 30,
    netRequirementMm: 5,
    pondExhausted: false,
  });
  assert.equal(projectPaddyDay({ ...paddy, lossMm: undefined }, 6), null);
  assert.equal(projectPaddyDay({ ...paddy, targetMm: 41 }, 6), null);
  const input = {
    ...irrigationDemo,
    mode: "estimated" as const,
    crop: "Rice (Paddy)",
    method: "Surface/Flood Irrigation",
    paddy,
  };
  const result = calculateSimpleIrrigation(input);
  assert.equal(result.available, true);
  assert.equal(result.netRequirementMm, 5);
  assert.equal(result.grossRequirementLitersMin?.toFixed(1), "142857.1");
  assert.equal(result.grossRequirementLitersMax?.toFixed(1), "166666.7");
  assert.equal(result.allowableDepletionMm, undefined);
  assert.equal(result.canSaveReminder, false);
  assert.equal(
    calculateSimpleIrrigation({ ...input, paddy: { ...paddy, lossMm: 60 } })
      .available,
    false,
  );
  assert.equal(
    calculateSimpleIrrigation({
      ...input,
      paddy: { ...paddy, rainMm: undefined },
    }).available,
    false,
  );
});

test("demo data is visibly synthetic and never permits a reminder", () => {
  const result = calculateIrrigationDemo();
  assert.equal(result.mode, "demo");
  assert.equal(result.available, true);
  assert.equal(result.canSaveReminder, false);
  assert.equal(result.measuredDepletionMm, undefined);
  assert.match(result.source.climate, /Synthetic/);
  assert.equal(result.source.climateSourceUrl, undefined);
});
