import type { Prisma } from "@prisma/client";

/** Deletes records owned by one cycle. Call only inside a Prisma transaction. */
export async function deleteOwnedCropCycle(tx: Prisma.TransactionClient, userId: string, cycleId: string) {
  const cycle = await tx.cropCycle.findFirst({
    where: { id: cycleId, field: { farm: { userId } } },
    select: { id: true },
  });
  if (!cycle) return false;

  const [lots, applications, assessments, soilReports] = await Promise.all([
    tx.production.findMany({ where: { cropCycleId: cycleId }, select: { id: true } }),
    tx.fertilizerApplication.findMany({ where: { cropCycleId: cycleId }, select: { id: true, expenseId: true } }),
    tx.cropProtectionAssessment.findMany({ where: { cropCycleId: cycleId }, select: { id: true } }),
    tx.fertilizerRecommendationHistory.findMany({ where: { userId, cropCycleId: cycleId }, select: { id: true, farmId: true, fieldId: true, cropId: true } }),
  ]);
  const lotIds = lots.map(row => row.id);
  const applicationIds = applications.map(row => row.id);
  const assessmentIds = assessments.map(row => row.id);
  const linkedExpenseIds = applications.flatMap(row => row.expenseId ? [row.expenseId] : []);

  // These rows use Restrict foreign keys, so remove their cycle-owned dependants first.
  if (assessmentIds.length) {
    await tx.alert.deleteMany({ where: { userId, dedupeKey: { in: assessmentIds.map(id => `crop-protection-followup:${id}`) } } });
    await tx.cropProtectionAssessment.deleteMany({ where: { id: { in: assessmentIds }, userId } });
  }
  if (lotIds.length) {
    await tx.cropLossAssessment.deleteMany({ where: { productionId: { in: lotIds } } });
    await tx.storageInspection.deleteMany({ where: { productionId: { in: lotIds } } });
  }
  if (applicationIds.length) {
    await tx.alert.deleteMany({ where: { userId, dedupeKey: { in: applicationIds.map(id => `fertilizer:${id}`) } } });
  }
  await tx.fertilizerApplication.deleteMany({ where: { cropCycleId: cycleId } });
  await tx.fertilizerPlan.deleteMany({ where: { cropCycleId: cycleId } });
  await tx.fertilizerAnalysis.deleteMany({ where: { cropCycleId: cycleId } });
  const reportsToPreserve = soilReports.filter(row => row.farmId || row.fieldId || row.cropId).map(row => row.id);
  const reportsToDelete = soilReports.filter(row => !row.farmId && !row.fieldId && !row.cropId).map(row => row.id);
  if (reportsToPreserve.length) await tx.fertilizerRecommendationHistory.updateMany({ where: { userId, id: { in: reportsToPreserve }, cropCycleId: cycleId }, data: { cropCycleId: null } });
  if (reportsToDelete.length) await tx.fertilizerRecommendationHistory.deleteMany({ where: { userId, id: { in: reportsToDelete }, cropCycleId: cycleId } });
  await tx.expense.deleteMany({
    where: { userId, OR: [{ cropCycleId: cycleId }, ...(linkedExpenseIds.length ? [{ id: { in: linkedExpenseIds } }] : [])] },
  });
  await tx.alert.deleteMany({
    where: { userId, OR: [
      { dedupeKey: { startsWith: `loss:${cycleId}:` } },
      ...(lotIds.length ? [{ productionId: { in: lotIds } }] : []),
    ] },
  });
  await tx.cropCalendarEvent.deleteMany({ where: { userId, cropCycleId: cycleId } });
  await tx.production.deleteMany({ where: { cropCycleId: cycleId } });
  const deleted = await tx.cropCycle.deleteMany({ where: { id: cycleId, field: { farm: { userId } } } });
  if (deleted.count !== 1) throw new Error("Crop cycle ownership changed during deletion.");
  return true;
}
