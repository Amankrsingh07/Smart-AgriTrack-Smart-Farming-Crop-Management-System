import test from "node:test";
import assert from "node:assert/strict";
import {
  allocationMatches,
  cropLossSchema,
  lossAllocationError,
  lossMetrics,
  lossAnalytics,
  resolveHarvestLot,
} from "../src/lib/crop-loss";
import {
  rainExposureAlerts,
  soilLossAlerts,
} from "../src/lib/crop-loss-prevention";
import { officialBulletinLinks } from "../src/lib/crop-loss-advisories";
import demo from "../prisma/data/crop-loss-demo.json";
const input = {
  mode: "REAL" as const,
  synthetic: false as const,
  productionId: "lot",
  version: 0,
  assessedDate: "2026-10-01",
  marketable: "850",
  damaged: "100",
  wasted: "50",
  unit: "kg",
  quantitiesConfirmed: true as const,
  evidence: "Scale receipt 123",
  cause: "Unknown" as const,
  priceConfirmed: false,
};
const lot = {
  quantity: "1000",
  unit: "kg",
  harvestDate: "2026-09-30",
  sales: [{ quantity: "800", unit: "kg" }],
};
test("exact allocation reconciles harvest, excludes overlaps and protects already sold stock", () => {
  assert.equal(lossAllocationError(input, lot), null);
  assert.match(
    lossAllocationError({ ...input, marketable: "800" }, lot)!,
    /must equal/,
  );
  assert.match(
    lossAllocationError({ ...input, unit: "quintal" }, lot)!,
    /exact harvest lot unit/,
  );
  assert.match(
    lossAllocationError(input, {
      ...lot,
      sales: [{ quantity: "900", unit: "kg" }],
    })!,
    /already sold/,
  );
  assert.match(
    lossAllocationError(input, {
      ...lot,
      sales: [{ quantity: "1", unit: "bag" }],
    })!,
    /units disagree/,
  );
  assert.match(
    lossAllocationError({ ...input, assessedDate: "2026-09-01" }, lot)!,
    /precede/,
  );
});
test("Rice, Wheat, Barley and Maize use the selected harvested lot only within its crop cycle", () => {
  for (const crop of ["Rice", "Wheat", "Barley", "Maize"]) {
    const cycleId = `${crop.toLowerCase()}-cycle`,
      lot = { id: `${crop.toLowerCase()}-lot`, cropCycleId: cycleId, crop };
    const other = {
      id: `${crop.toLowerCase()}-other-lot`,
      cropCycleId: `${cycleId}-other`,
      crop: "Other",
    };
    assert.equal(resolveHarvestLot([other, lot], cycleId, lot.id), lot);
    assert.equal(
      resolveHarvestLot([other, lot], `${cycleId}-other`, lot.id),
      undefined,
    );
    assert.equal(resolveHarvestLot([other, lot], cycleId)?.id, lot.id);
  }
});
test("harvest edit quantities reconcile exactly and recalculate loss only from complete evidence", () => {
  assert.equal(allocationMatches("20", "17", "2", "1"), true);
  assert.equal(allocationMatches("20", "17", "2", "0.5"), false);
  assert.equal(
    cropLossSchema.safeParse({
      ...input,
      totalHarvested: "20",
      marketable: "17",
      damaged: "2",
      wasted: "1",
    }).success,
    true,
  );
  const complete = lossMetrics({
    harvested: "20",
    marketable: "17",
    damaged: "2",
    wasted: "1",
    quantitiesConfirmed: true,
    priceConfirmed: true,
    pricePerUnit: "1000",
    damagedRecovery: "500",
    priceEvidence: "Verified receipt",
  });
  assert.equal(complete.affected, "3");
  assert.equal(complete.lossPercent, "15.00");
  assert.equal(complete.monetaryLoss, "2500.00");
  const missingPrice = lossMetrics({
    harvested: "20",
    marketable: "17",
    damaged: "2",
    wasted: "1",
    quantitiesConfirmed: true,
    priceConfirmed: false,
    pricePerUnit: null,
    damagedRecovery: null,
  });
  assert.equal(missingPrice.lossPercent, "15.00");
  assert.equal(missingPrice.monetaryLoss, null);
});
test("invalid dates, negatives, precision, unconfirmed evidence and incomplete price are rejected", () => {
  assert.ok(cropLossSchema.safeParse(input).success);
  assert.equal(
    cropLossSchema.safeParse({ ...input, harvestedLotId: "other-lot" }).success,
    false,
  );
  assert.equal(
    cropLossSchema.safeParse({ ...input, synthetic: true }).success,
    false,
  );
  assert.equal(
    cropLossSchema.safeParse({ ...input, mode: "DEMO" }).success,
    false,
  );
  assert.equal(
    cropLossSchema.safeParse({ ...input, dataLabel: "DEMO DATA" }).success,
    false,
  );
  for (const value of ["2026-02-30", "2999-01-01"])
    assert.equal(
      cropLossSchema.safeParse({ ...input, assessedDate: value }).success,
      false,
    );
  for (const value of ["-1", "NaN", "Infinity", "0.0001"])
    assert.equal(
      cropLossSchema.safeParse({ ...input, damaged: value }).success,
      false,
    );
  assert.equal(
    cropLossSchema.safeParse({ ...input, quantitiesConfirmed: false }).success,
    false,
  );
  assert.equal(
    cropLossSchema.safeParse({ ...input, evidence: "" }).success,
    false,
  );
  assert.equal(
    cropLossSchema.safeParse({ ...input, priceConfirmed: true }).success,
    false,
  );
  assert.match(
    lossAllocationError(
      {
        ...input,
        priceConfirmed: true,
        pricePerUnit: "25",
        damagedRecovery: "2501",
        priceEvidence: "verified receipt",
      },
      lot,
    )!,
    /recovery/,
  );
});
test("seed-only synthetic examples conserve quantities and match deterministic results", () => {
  assert.equal(demo.synthetic, true);
  assert.match(demo.label, /DEMO DATA/);
  for (const row of demo.examples) {
    const metrics = lossMetrics(row);
    assert.equal(metrics.lossPercent, row.expectedLossPercent);
    assert.equal(metrics.monetaryLoss, row.expectedMonetaryLoss);
  }
});
test("unknown verification or price stays insufficient; explicit zero loss is supported", () => {
  const row = demo.examples[0];
  assert.equal(
    lossMetrics({ ...row, quantitiesConfirmed: false }).lossPercent,
    null,
  );
  assert.equal(
    lossMetrics({ ...row, priceConfirmed: false }).monetaryLoss,
    null,
  );
  assert.equal(lossMetrics({ ...row, priceEvidence: null }).monetaryLoss, null);
  assert.equal(lossMetrics({ ...row, pricePerUnit: null }).monetaryLoss, null);
  assert.equal(lossMetrics({ ...row, harvested: "0" }).lossPercent, null);
  assert.equal(
    lossMetrics({
      ...row,
      marketable: "1000",
      damaged: "0",
      wasted: "0",
      damagedRecovery: "0",
    }).monetaryLoss,
    "0.00",
  );
});
test("analytics use weighted ratios, exact units and complete valuation coverage", () => {
  const first = demo.examples[0];
  const rows = [
    { ...first, metrics: first },
    {
      ...first,
      metrics: {
        ...first,
        harvested: "100",
        marketable: "100",
        damaged: "0",
        wasted: "0",
        damagedRecovery: "0",
      },
    },
    { ...demo.examples[1], metrics: demo.examples[1] },
  ];
  const grouped = lossAnalytics(rows);
  assert.equal(grouped.crop.length, 2);
  assert.equal(
    grouped.year.find((r) => r.label === "2025")!.lossPercent,
    "13.64",
  );
  const partial = lossAnalytics([
    { ...first, metrics: first },
    { ...first, metrics: { ...first, priceConfirmed: false } },
  ]);
  assert.equal(partial.year[0].monetaryLoss, null);
  assert.equal(partial.year[0].lots, 2);
  assert.equal(partial.year[0].valuedLots, 1);
  const mixed = lossAnalytics([
    { ...first, metrics: first },
    { ...first, unit: "bag", metrics: first },
  ]);
  assert.equal(mixed.year.length, 2);
});
test("weather alerts disclose uncertainty, require actual model data and never interpret demo forecasts", () => {
  const weather = {
    stage: "Maturity",
    harvested: false,
    daily: {
      time: ["2026-11-14", "2026-11-15", "2026-11-20"],
      precipitation_sum: [0, 2, 50],
      precipitation_probability_max: [0, 40, 90],
    },
    fetchedAt: "2026-11-14T00:00:00Z",
  };
  const alerts = rainExposureAlerts(weather, "2026-11-14");
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].message, /40%/);
  assert.match(alerts[0].uncertainty, /not crop loss/);
  assert.equal(
    rainExposureAlerts({ ...weather, demo: true }, "2026-11-14").length,
    0,
  );
  assert.equal(
    rainExposureAlerts({ ...weather, stage: "Vegetative" }, "2026-11-14")
      .length,
    0,
  );
});
test("soil review ignores synthetic, unsupported and unconfirmed reports", () => {
  const sample = {
    mode: "REAL" as const,
    labReferenceConfirmed: true,
    laboratoryName: "ISOLATED unit test metadata",
    state: "Bihar",
    district: "Saran",
    crop: "Wheat",
    growthStage: "Maturity",
    soilType: "Alluvial",
  };
  const report = {
    analysisVersion: "soil-modes-v4",
    laboratoryConfirmed: true,
    nutrients: [
      {
        name: "N",
        rating: "Low",
        sourceUrl: "https://biharsoilhealth.in/documents/manualgoi.pdf",
        reference: { method: "ALKALINE_KMNO4_N" },
      },
    ],
  };
  assert.equal(soilLossAlerts(sample, report, "2026-01-01").length, 1);
  assert.equal(
    soilLossAlerts({ ...sample, mode: "DEMO" }, report, "2026-01-01").length,
    0,
  );
  assert.equal(
    soilLossAlerts(
      sample,
      { ...report, analysisVersion: "legacy" },
      "2026-01-01",
    ).length,
    0,
  );
  assert.equal(
    soilLossAlerts(
      sample,
      { ...report, laboratoryConfirmed: false },
      "2026-01-01",
    ).length,
    0,
  );
  assert.equal(
    soilLossAlerts(
      sample,
      { ...report, nutrients: [{ ...report.nutrients[0], rating: "Unknown" }] },
      "2026-01-01",
    ).length,
    0,
  );
});
test("official index parsing rejects offsite links, scripts and non-PDF destinations", () => {
  const html = `<a href="/report.pdf">a</a><a href="https://evil.example/fake.pdf">b</a><a href="javascript:bad.pdf">c</a><a href="/report.pdf">duplicate</a><a href="http://mausam.imd.gov.in/insecure.pdf">d</a>`;
  assert.deepEqual(
    officialBulletinLinks(html, "https://mausam.imd.gov.in/index.php"),
    ["https://mausam.imd.gov.in/report.pdf"],
  );
});
