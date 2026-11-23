import test from "node:test";
import assert from "node:assert/strict";
import { soilLinkError, soilLocationsMatch } from "../src/lib/soil-health-links";
const input = { state: "Bihar", district: "Saran", crop: "Wheat", growthStage: "Vegetative", soilType: "Alluvial", fieldId: "field" };
const field = { id: "field", farmId: "farm", soilType: "Alluvial", farm: { state: "Bihar", district: "Chhapra" } };
test("linked soil samples accept recognized district aliases without rewriting original names", () => {
  assert.equal(soilLinkError(input, { field }), null);
  assert.equal(input.district, "Saran");
  assert.equal(field.farm.district, "Chhapra");
  assert.equal(soilLocationsMatch({ state: "Orissa", district: "Puri" }, { state: "Odisha", district: "Puri" }), true);
  assert.equal(soilLocationsMatch({ state: " bihar ", district: " SARAN " }, input), true);
});
test("location normalization never permits genuinely different states or districts", () => {
  assert.match(soilLinkError({ ...input, district: "Patna" }, { field })!, /location/);
  assert.match(soilLinkError({ ...input, state: "Punjab" }, { field })!, /location/);
  assert.equal(soilLocationsMatch({ state: "बिहार", district: "सारण" }, { state: "पंजाब", district: "पटना" }), false);
  assert.match(soilLinkError(input, { field: null })!, /not found/);
});
