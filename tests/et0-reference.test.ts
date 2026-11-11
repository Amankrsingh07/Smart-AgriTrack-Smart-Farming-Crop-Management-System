import assert from "node:assert/strict";
import test from "node:test";
import { findOfflineEt0, offlineEt0DatasetMeta } from "../src/lib/et0-reference";

test("Saran offline ETo includes verified monthly references for all twelve months", () => {
  const expectedMmDay = [2, 2.8, 4.4, 5.8, 6, 5.1, 3.9, 3.7, 3.5, 3.4, 2.6, 1.9];
  for (let month = 1; month <= 12; month++) {
    const result = findOfflineEt0("Bihar", "Saran", month);
    assert.ok(result, `missing Saran ETo month ${month}`);
    assert.equal(result.state, "Bihar");
    assert.equal(result.district, "Saran");
    assert.equal(result.record.month, month);
    assert.equal(result.record.et0MmDay, expectedMmDay[month - 1]);
    assert.equal(result.units.et0MmDay, "mm/day");
    assert.match(result.source, /FAO AQUASTAT/);
    assert.ok(result.sourceUrl.includes("fao.org/aquastat"));
    assert.equal(result.referencePeriod, "1961-1990");
    assert.equal(result.datasetVersion, "FAO-AQUASTAT-CRU-CL2.0-1961-1990-v1.0");
    assert.match(result.verificationStatus, /OFFICIAL_FAO_GRID_CLIMATOLOGY/);
    assert.match(result.spatialMethod, /centroid/);
  }
});

test("Chhapra and Chapra resolve to the same official Saran district records with an explicit alias marker", () => {
  for (let month = 1; month <= 12; month++) {
    const saran = findOfflineEt0("Bihar", "Saran", month);
    const chhapra = findOfflineEt0("Bihar", "Chhapra", month);
    const chapra = findOfflineEt0("Bihar", "Chapra", month);
    assert.ok(saran && chhapra && chapra);
    assert.equal(chhapra.aliasUsed, true);
    assert.equal(chhapra.record.et0MmDay, saran.record.et0MmDay);
    assert.equal(chapra.record.et0MmDay, saran.record.et0MmDay);
    assert.equal(chhapra.districtResolutionSourceUrl, "https://saran.nic.in/history/");
  }
});

test("unsupported district or invalid month returns no ETo instead of borrowing another district value", () => {
  assert.equal(findOfflineEt0("Bihar", "Unconfigured District", 1), undefined);
  assert.equal(findOfflineEt0("West Bengal", "Chhapra", 1), undefined);
  assert.equal(findOfflineEt0("Bihar", "Saran", 0), undefined);
  assert.equal(findOfflineEt0("Bihar", "Saran", 13), undefined);
  assert.equal(offlineEt0DatasetMeta.offlineOnly, true);
});
