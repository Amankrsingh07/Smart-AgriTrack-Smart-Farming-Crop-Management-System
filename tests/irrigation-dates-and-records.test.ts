import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarDays,
  dateAtUtcNoon,
  indiaCalendarDate,
} from "../src/lib/irrigation-dates";
import {
  isSameWateringTransaction,
  wateringRecordIdentity,
} from "../src/lib/watering-record";

test("soil-check reminder date is exactly three India calendar days after calculation", () => {
  const calculationDate = indiaCalendarDate(
    new Date("2026-11-06T19:00:00.000Z"),
  );
  assert.equal(calculationDate, "2026-11-07");
  const planned = addCalendarDays(calculationDate, 3);
  assert.equal(planned, "2026-11-10");
  assert.equal(
    dateAtUtcNoon(planned).toISOString(),
    "2026-11-10T12:00:00.000Z",
  );
});

test("reminder date arithmetic handles month/year boundaries and rejects invalid dates", () => {
  assert.equal(addCalendarDays("2026-12-30", 3), "2027-01-02");
  assert.throws(() => addCalendarDays("2026-02-30", 3), RangeError);
});

test("watering payload normalization keeps different same-day applications distinct", () => {
  const first = wateringRecordIdentity({
    irrigationDate: "2026-11-06",
    waterAppliedLiters: 50,
    method: "Drip Irrigation",
    notes: "North bed",
  });
  const repeated = wateringRecordIdentity({
    irrigationDate: "2026-11-06",
    waterAppliedLiters: 50,
    method: "Drip Irrigation",
    notes: " North bed ",
  });
  const secondApplication = wateringRecordIdentity({
    irrigationDate: "2026-11-06",
    waterAppliedLiters: 5,
    method: "Drip Irrigation",
    notes: "North bed",
  });
  assert.deepEqual(repeated, first);
  assert.notDeepEqual(secondApplication, first);
});

test("transaction ID retries are idempotent while distinct event IDs remain distinct", () => {
  const stored = {
    clientTransactionId: "tx-1",
    userId: "user-1",
    cropCycleId: "cycle-1",
    scheduledAt: new Date("2026-11-06T12:00:00.000Z"),
    actualQuantityLiters: 50,
    method: "Drip Irrigation",
    notes: "North bed",
  };
  const original = {
    transactionId: "tx-1",
    userId: "user-1",
    cropCycleId: "cycle-1",
    irrigationDate: "2026-11-06",
    waterAppliedLiters: 50,
    method: "Drip Irrigation",
    notes: "North bed",
  };
  assert.equal(isSameWateringTransaction(stored, original), true);
  assert.equal(
    isSameWateringTransaction(stored, { ...original, transactionId: "tx-2" }),
    false,
  );
  assert.equal(
    isSameWateringTransaction(stored, {
      ...original,
      transactionId: "tx-1",
      waterAppliedLiters: 5,
    }),
    false,
  );
});
