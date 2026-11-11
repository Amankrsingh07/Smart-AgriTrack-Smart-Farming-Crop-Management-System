import test from "node:test";
import assert from "node:assert/strict";
import { findCropCalendarProfile, generateCropCalendarActivities, selectCropDuration, toHectares } from "../src/lib/crop-calendar";
import { reconcileCropCalendarActivities } from "../src/lib/crop-calendar-reconciliation";

test("crop calendar dates are derived from sowing date and configured crop duration", () => {
  const generated = generateCropCalendarActivities({
    cropName: "Wheat", state: "Bihar", district: "Patna", season: "RABI",
    sowingDate: new Date("2026-11-15T00:00:00.000Z"), areaHa: toHectares(1, "acre"),
  });
  assert.equal(generated.duration.days, 120);
  assert.equal(generated.estimatedHarvestDate.toISOString().slice(0, 10), "2027-03-15");
  assert.equal(generated.activities.find(item => item.activityKey === "sowing")?.scheduledDate.toISOString().slice(0, 10), "2026-11-15");
  assert.equal(generated.activities.find(item => item.activityKey === "maturity-check")?.scheduledDate.toISOString().slice(0, 10), "2027-03-05");
  assert.equal(new Set(generated.activities.map(item => item.activityKey)).size, generated.activities.length);
});

test("variety and farmer-entered durations override the profile duration", () => {
  const rice = findCropCalendarProfile("paddy");
  assert.ok(rice);
  assert.equal(selectCropDuration(rice, "Pusa Basmati 1509").days, 115);
  assert.equal(selectCropDuration(rice, undefined, 130).days, 130);
});

test("generation rejects a crop-season combination missing from the offline dataset", () => {
  assert.throws(() => generateCropCalendarActivities({
    cropName: "Wheat", state: "Bihar", district: "Patna", season: "KHARIF",
    sowingDate: new Date("2026-06-15T00:00:00.000Z"), areaHa: 1,
  }), /configured for RABI/);
});

test("unsupported crop errors name the crop and list available offline profiles", () => {
  assert.throws(() => generateCropCalendarActivities({
    cropName: "Barley", state: "Bihar", district: "Patna", season: "RABI",
    sowingDate: new Date("2026-11-15T00:00:00.000Z"), areaHa: 1,
  }), /Barley.*Supported crops: .*Wheat.*Rice \(Paddy\).*Soybean.*No schedule was generated/);
});

test("generic Millet requires a source-listed millet type instead of using one false generic duration", () => {
  const millet = findCropCalendarProfile("Millet");
  assert.ok(millet);
  assert.throws(() => selectCropDuration(millet), /Select a millet type or variety/);
  const pearlMillet = selectCropDuration(millet, "Pearl millet (Bajra)");
  assert.equal(pearlMillet.days, 80);
  assert.deepEqual(pearlMillet.range, [74, 85]);
});

test("Millet calendar harvest date uses the selected type's source-reported duration", () => {
  const generated = generateCropCalendarActivities({
    cropName: "Millet", state: "Rajasthan", district: "Jaipur", season: "KHARIF",
    sowingDate: new Date("2026-07-01T00:00:00.000Z"), variety: "Pearl millet (Bajra)", areaHa: 1,
  });
  assert.equal(generated.duration.days, 80);
  assert.equal(generated.estimatedHarvestDate.toISOString().slice(0, 10), "2026-09-19");
  const establishment = generated.activities.find(item => item.activityKey === "establishment-check");
  assert.match(establishment?.description ?? "", /source-reported planning profile/);
  assert.equal(establishment?.sourceUrl, "https://ztmbpd.iari.res.in/technologies/varietieshybrids/cereals/pearl-millet/");
  assert.equal(generated.fertilizerProfileMatched, false);
});

test("area conversion accepts hectares and converts acres", () => {
  assert.equal(toHectares(2, "hectare"), 2);
  assert.ok(Math.abs(toHectares(1, "acre") - 0.4046856422) < 1e-12);
});

test("lifecycle checkpoints are calculated from the selected crop duration", () => {
  const sowingDate = new Date("2026-06-01T00:00:00.000Z");
  const millet = generateCropCalendarActivities({ cropName: "Millet", state: "Rajasthan", district: "Jaipur", season: "KHARIF", sowingDate, variety: "Pearl millet (Bajra)", areaHa: 1 });
  const wheat = generateCropCalendarActivities({ cropName: "Wheat", state: "Bihar", district: "Patna", season: "RABI", sowingDate: new Date("2026-11-15T00:00:00.000Z"), areaHa: 1 });
  assert.equal(millet.activities.find(item => item.activityKey === "flowering-check")?.scheduledDate.toISOString().slice(0, 10), "2026-07-19");
  assert.equal(wheat.activities.find(item => item.activityKey === "flowering-check")?.scheduledDate.toISOString().slice(0, 10), "2027-01-26");
  assert.ok(millet.activities.some(item => item.activityType === "IRRIGATION_REVIEW"));
  assert.ok(millet.activities.some(item => item.activityType === "PEST_MONITORING"));
  assert.ok(millet.activities.some(item => item.activityType === "WEED_MONITORING"));
  assert.ok(millet.activities.every(item => item.activityType !== "FERTILIZER" || item.sourceUrl));
});

test("calendar reconciliation recalculates pending tasks and preserves completed records", () => {
  const completed = { activityKey: "sowing", status: "COMPLETED", date: "2026-06-01", notes: "Done" };
  const pending = { activityKey: "flowering-check", status: "PENDING", date: "2026-07-01" };
  const obsolete = { activityKey: "old-check", status: "PENDING" };
  const result = reconcileCropCalendarActivities([completed, pending, obsolete], [{ activityKey: "sowing" }, { activityKey: "flowering-check" }, { activityKey: "new-check" }]);
  assert.deepEqual(result.preserveCompleted, [completed]);
  assert.deepEqual(result.toUpsert.map(item => item.activityKey), ["flowering-check", "new-check"]);
  assert.deepEqual(result.removeObsoletePending, [obsolete]);
});
