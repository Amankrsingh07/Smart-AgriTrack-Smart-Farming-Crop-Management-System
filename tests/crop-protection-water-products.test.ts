import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessWaterSodium,
  waterQualityReference,
} from "../src/lib/crop-protection-water";
import {
  assessProtectionLabs,
  type ProtectionLab,
} from "../src/lib/crop-protection-labs";
import { productRestrictionReview } from "../src/lib/crop-protection-products";
const ec: ProtectionLab = {
  matrix: "Water",
  parameter: "EC",
  value: 0.1,
  unit: "dS/m",
  method: "EC at 25°C",
  laboratory: "Example",
  sampleDate: "2026-01-01",
  reportReference: "Example-report",
  sampleLocation: "Own sampling point",
};
const sar: ProtectionLab = {
  ...ec,
  parameter: "SAR",
  value: 2,
  unit: "SAR",
  method: "Laboratory reported SAR",
};
test("joint water screening requires identical sample identity, metadata and supported units", () => {
  assert.equal(
    assessWaterSodium([ec, sar]).status,
    "Severe infiltration restriction",
  );
  assert.equal(
    assessWaterSodium([ec, { ...sar, sampleLocation: "Another point" }]).status,
    "Insufficient data",
  );
  assert.equal(
    assessWaterSodium([ec, { ...sar, unit: "mg/L" }]).status,
    "Insufficient data",
  );
  assert.equal(
    assessWaterSodium([ec, { ...sar, value: 3 }]).status,
    "Reference boundary review",
  );
  assert.equal(
    assessWaterSodium([ec, { ...sar, value: 50 }]).status,
    "Outside configured reference",
  );
  assert.equal(
    assessWaterSodium([{ ...ec, value: 1 }, sar]).status,
    "No infiltration restriction indicated by this EC/SAR pair",
  );
  assert.ok(waterQualityReference.scope.includes("Not an Indian statutory"));
});
test("TDS interpretation retains exact unit and cannot certify overall water suitability", () => {
  const r = assessProtectionLabs([
    {
      ...ec,
      parameter: "TDS",
      value: 2100,
      unit: "mg/L",
      method: "Reported TDS method",
    },
  ]);
  assert.match(
    r.findings[0].interpretation,
    /Severe salinity restriction by TDS/,
  );
  assert.equal(r.waterStatus, "Insufficient data");
  assert.equal(
    assessProtectionLabs([
      { ...ec, parameter: "TDS", value: 2100, unit: "mg/kg" },
    ]).findings[0].reference,
    null,
  );
});
test("dated product restrictions are crop/ingredient-specific and never imply approval on a nonmatch", () => {
  assert.ok(productRestrictionReview("malathion", "Tomato").flags.length);
  assert.equal(productRestrictionReview("malathion", "Wheat").flags.length, 0);
  assert.equal(
    productRestrictionReview("trade-name-only", "Tomato").registrationVerified,
    false,
  );
  assert.ok(
    productRestrictionReview("trade-name-only", "Tomato").limitation.includes(
      "Absence of a match is never approval",
    ),
  );
  assert.ok(productRestrictionReview("Carbaryl", "Wheat").flags.length);
});
