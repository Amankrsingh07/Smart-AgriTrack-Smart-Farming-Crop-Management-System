import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { deleteOwnedCropCycle } from "../src/lib/delete-crop-cycle";

function fakeTx(options: { owned?: boolean; failAt?: string } = {}) {
  const calls: Array<{ model: string; method: string; args: unknown }> = [];
  const invoke = (model: string, method: string, result: unknown) => async (args: unknown) => {
    calls.push({ model, method, args });
    if (options.failAt === `${model}.${method}`) throw new Error("simulated database failure");
    return result;
  };
  const tx = {
    cropCycle: { findFirst: invoke("cropCycle", "findFirst", options.owned === false ? null : { id: "cycle-1" }), deleteMany: invoke("cropCycle", "deleteMany", { count: 1 }) },
    production: { findMany: invoke("production", "findMany", [{ id: "lot-1" }]), deleteMany: invoke("production", "deleteMany", { count: 1 }) },
    fertilizerApplication: { findMany: invoke("fertilizerApplication", "findMany", [{ id: "application-1", expenseId: "fert-expense" }]), deleteMany: invoke("fertilizerApplication", "deleteMany", { count: 1 }) },
    cropProtectionAssessment: { findMany: invoke("cropProtectionAssessment", "findMany", [{ id: "assessment-1" }]), deleteMany: invoke("cropProtectionAssessment", "deleteMany", { count: 1 }) },
    fertilizerRecommendationHistory: {
      findMany: invoke("fertilizerRecommendationHistory", "findMany", [{ id: "shared-soil-report", farmId: "farm-1", fieldId: "field-1", cropId: "crop-1" }]),
      updateMany: invoke("fertilizerRecommendationHistory", "updateMany", { count: 1 }),
      deleteMany: invoke("fertilizerRecommendationHistory", "deleteMany", { count: 1 }),
    },
    alert: { deleteMany: invoke("alert", "deleteMany", { count: 1 }) },
    cropLossAssessment: { deleteMany: invoke("cropLossAssessment", "deleteMany", { count: 1 }) },
    storageInspection: { deleteMany: invoke("storageInspection", "deleteMany", { count: 1 }) },
    fertilizerPlan: { deleteMany: invoke("fertilizerPlan", "deleteMany", { count: 1 }) },
    fertilizerAnalysis: { deleteMany: invoke("fertilizerAnalysis", "deleteMany", { count: 1 }) },
    expense: { deleteMany: invoke("expense", "deleteMany", { count: 2 }) },
    cropCalendarEvent: { deleteMany: invoke("cropCalendarEvent", "deleteMany", { count: 1 }) },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, calls };
}

test("deletes cycle expenses and indirect lot/application records by exact cycle ID", async () => {
  const { tx, calls } = fakeTx();
  assert.equal(await deleteOwnedCropCycle(tx, "farmer-1", "cycle-1"), true);
  const call = (model: string, method: string) => calls.find(row => row.model === model && row.method === method)?.args as { where: Record<string, unknown> };
  assert.deepEqual(call("cropCycle", "findFirst").where, { id: "cycle-1", field: { farm: { userId: "farmer-1" } } });
  assert.deepEqual(call("cropCycle", "deleteMany").where, { id: "cycle-1", field: { farm: { userId: "farmer-1" } } });
  assert.deepEqual(call("expense", "deleteMany").where, { userId: "farmer-1", OR: [{ cropCycleId: "cycle-1" }, { id: { in: ["fert-expense"] } }] });
  assert.deepEqual(call("cropLossAssessment", "deleteMany").where, { productionId: { in: ["lot-1"] } });
  assert.deepEqual(call("storageInspection", "deleteMany").where, { productionId: { in: ["lot-1"] } });
  assert.equal(calls.some(row => row.model === "inventoryThreshold"), false, "shared crop-name inventory thresholds are preserved");
  assert.deepEqual(call("fertilizerRecommendationHistory", "updateMany"), { where: { userId: "farmer-1", id: { in: ["shared-soil-report"] }, cropCycleId: "cycle-1" }, data: { cropCycleId: null } }, "field-linked soil history is retained and detached");
  assert.equal(calls.some(row => row.model === "fertilizerRecommendationHistory" && row.method === "deleteMany"), false);
});

test("authorization failure leaves all linked and shared records untouched", async () => {
  const { tx, calls } = fakeTx({ owned: false });
  assert.equal(await deleteOwnedCropCycle(tx, "different-farmer", "cycle-1"), false);
  assert.deepEqual(calls.map(row => `${row.model}.${row.method}`), ["cropCycle.findFirst"]);
});

test("a failed dependent-record deletion rejects so the surrounding Prisma transaction can roll back", async () => {
  const { tx, calls } = fakeTx({ failAt: "storageInspection.deleteMany" });
  await assert.rejects(deleteOwnedCropCycle(tx, "farmer-1", "cycle-1"), /simulated database failure/);
  assert.equal(calls.some(row => row.model === "cropCycle" && row.method === "deleteMany"), false);
});
