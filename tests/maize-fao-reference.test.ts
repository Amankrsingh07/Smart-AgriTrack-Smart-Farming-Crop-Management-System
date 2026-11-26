import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMaizeEtcReference,
  mapFarmerStageToFaoStage,
  type KcReferencePoint,
} from "../src/lib/maize-fao-reference";

const source = "https://www.fao.org/4/S2022E/s2022e07.htm";
const paper56 = "https://www.fao.org/4/X0490E/x0490e00.htm";
const points: KcReferencePoint[] = [
  {
    stageName: "FAO Crop Water Needs Table 8 — Initial stage",
    value: 0.4,
    startDay: 1,
    endDay: 20,
    source: "FAO",
    sourceUrl: source,
    publicationTitle: "Irrigation Water Management: Irrigation Water Needs",
    publicationYear: 1986,
    tableReference: "Table 8; Table 7",
  },
  {
    stageName: "FAO Crop Water Needs Table 8 — Crop development stage",
    value: 0.8,
    startDay: 21,
    endDay: 55,
    source: "FAO",
    sourceUrl: source,
    publicationTitle: "Irrigation Water Management: Irrigation Water Needs",
    publicationYear: 1986,
    tableReference: "Table 8; Table 7",
  },
  {
    stageName: "FAO Crop Water Needs Table 8 — Mid-season stage",
    value: 1.15,
    startDay: 56,
    endDay: 95,
    source: "FAO",
    sourceUrl: source,
    publicationTitle: "Irrigation Water Management: Irrigation Water Needs",
    publicationYear: 1986,
    tableReference: "Table 8; Table 7",
  },
  {
    stageName: "FAO Crop Water Needs Table 8 — Late season stage",
    value: 0.7,
    startDay: 96,
    endDay: 125,
    source: "FAO",
    sourceUrl: source,
    publicationTitle: "Irrigation Water Management: Irrigation Water Needs",
    publicationYear: 1986,
    tableReference: "Table 8; Table 7",
  },
];

test("Vegetative maps broadly to Crop Development; other farmer stages resolve transparently", () => {
  assert.equal(
    mapFarmerStageToFaoStage("Vegetative"),
    "Crop development stage",
  );
  assert.equal(mapFarmerStageToFaoStage("Establishment"), "Initial stage");
  assert.equal(mapFarmerStageToFaoStage("Flowering"), "Mid-season stage");
  assert.equal(mapFarmerStageToFaoStage("Maturity"), "Late season stage");
  assert.equal(mapFarmerStageToFaoStage("Unrecorded"), undefined);
});

test("sowing date, FAO stage durations, and interpolation produce daily Kc and ETc", () => {
  const result = calculateMaizeEtcReference(
    [
      { date: "2026-10-01", et0Mm: 4 }, // initial Kc .40
      { date: "2026-10-22", et0Mm: 5 }, // second development day, interpolated
      { date: "2026-11-25", et0Mm: 6 }, // mid-season Kc 1.15
      { date: "2027-01-04", et0Mm: 2 }, // first late-season day, starts at 1.15
    ],
    "2026-10-01",
    "2027-02-02",
    points,
  );
  assert.ok(result && result.daily.length === 4);
  assert.deepEqual(
    result.daily.map((day) => day.stageName),
    [
      points[0].stageName,
      points[1].stageName,
      points[2].stageName,
      points[3].stageName,
    ],
  );
  assert.equal(result.daily[0].kc, 0.4);
  assert.ok(result.daily[1].kc > 0.4 && result.daily[1].kc < 1.15);
  assert.equal(result.daily[2].kc, 1.15);
  assert.equal(result.daily[3].kc, 1.15);
  assert.equal(result.daily[0].etcMm, 1.6);
  assert.equal(
    result.weeklyEtcMm,
    result.daily.reduce((sum, day) => sum + day.et0Mm * day.kc, 0),
  );
  assert.equal(result.sourceUrl, source);
  assert.equal(result.publicationYear, 1986);
  assert.equal(result.tableReference, "Table 8; Table 7");
  assert.equal(paper56, "https://www.fao.org/4/X0490E/x0490e00.htm");
});

test("missing sowing date, incomplete ET0, or mismatched harvest duration withholds ETc", () => {
  assert.equal(
    calculateMaizeEtcReference(
      [{ date: "2026-10-01", et0Mm: 4 }],
      null,
      null,
      points,
    ).reason,
    "missing-sowing-date",
  );
  assert.equal(
    calculateMaizeEtcReference(
      [{ date: "2026-10-01", et0Mm: null }],
      "2026-10-01",
      null,
      points,
    ).reason,
    "incomplete-et0",
  );
  assert.equal(
    calculateMaizeEtcReference(
      [{ date: "2026-10-01", et0Mm: 4 }],
      "2026-10-01",
      "2026-12-01",
      points,
    ).reason,
    "cycle-length-mismatch",
  );
  assert.equal(
    calculateMaizeEtcReference(
      [{ date: "2026-10-01", et0Mm: 4 }],
      "2026-10-01",
      null,
      points.slice(0, 3),
    ).reason,
    "missing-stage-data",
  );
});
