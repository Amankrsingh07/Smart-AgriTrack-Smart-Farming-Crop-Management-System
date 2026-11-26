import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import SimpleIrrigationPlanner, {
  type IrrigationReport,
  type PlannerCycle,
  type PlannerHistoryRow,
} from "./simple-irrigation-planner";

export default async function IrrigationPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const [user, params] = await Promise.all([getUser(), searchParams]);
  if (!user) return null;
  const [cycles, history] = await Promise.all([
    db.cropCycle.findMany({
      where: { field: { farm: { userId: user.id } } },
      select: {
        id: true,
        growthStage: true,
        status: true,
        crop: { select: { name: true } },
        field: {
          select: {
            id: true,
            name: true,
            area: true,
            areaUnit: true,
            soilType: true,
            soilTexture: true,
            irrigationMethod: true,
            farm: { select: { name: true, state: true, district: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.irrigationSchedule.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        cropCycleId: true,
        scheduledAt: true,
        completedAt: true,
        status: true,
        isCheckOnly: true,
        recommendedQuantityLiters: true,
        actualQuantityLiters: true,
        method: true,
        notes: true,
        recommendationNotes: true,
        recommendationSource: true,
        cropCycle: {
          select: {
            crop: { select: { name: true } },
            field: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledAt: "desc" },
    }),
  ]);
  const cycleData: PlannerCycle[] = cycles.map((cycle) => ({
    id: cycle.id,
    crop: cycle.crop.name,
    stage: cycle.growthStage,
    status: cycle.status,
    field: cycle.field.name,
    farm: cycle.field.farm.name,
    state: cycle.field.farm.state,
    district: cycle.field.farm.district,
    area: Number(cycle.field.area),
    areaUnit: cycle.field.areaUnit,
    soil: cycle.field.soilTexture ?? cycle.field.soilType,
    method: cycle.field.irrigationMethod,
  }));
  const historyData: PlannerHistoryRow[] = history.map((row) => ({
    id: row.id,
    cropCycleId: row.cropCycleId,
    crop: row.cropCycle.crop.name,
    field: row.cropCycle.field.name,
    date: row.scheduledAt.toISOString().slice(0, 10),
    completed: row.completedAt !== null || row.status === "COMPLETED",
    status: row.status ?? (row.completedAt ? "COMPLETED" : "PLANNED"),
    method: row.method,
    isCheckOnly: row.isCheckOnly,
    // Old saved schedules do not persist the measured soil inputs now required for a valid estimate.
    recommendedLiters:
      row.recommendationSource === "VERIFIED_MEASURED_WATER_BALANCE_V1" &&
      row.recommendedQuantityLiters !== null
        ? Number(row.recommendedQuantityLiters)
        : null,
    actualLiters:
      row.actualQuantityLiters === null
        ? null
        : Number(row.actualQuantityLiters),
    note: row.isCheckOnly
      ? "Soil-check reminder only; no watering amount is implied."
      : row.actualQuantityLiters !== null
        ? row.notes
        : null,
  }));
  const completed = history.filter(
    (row) =>
      !row.isCheckOnly &&
      row.status === "COMPLETED" &&
      row.completedAt !== null &&
      row.actualQuantityLiters !== null,
  );
  const cropTotals = new Map<string, { liters: number; count: number }>();
  const monthTotals = new Map<string, { liters: number; count: number }>();
  for (const row of completed) {
    const liters = Number(row.actualQuantityLiters);
    const cropName = row.cropCycle.crop.name;
    const monthKey = row.scheduledAt.toISOString().slice(0, 7);
    const cropEntry = cropTotals.get(cropName) ?? { liters: 0, count: 0 };
    cropEntry.liters += liters;
    cropEntry.count += 1;
    cropTotals.set(cropName, cropEntry);
    const monthEntry = monthTotals.get(monthKey) ?? { liters: 0, count: 0 };
    monthEntry.liters += liters;
    monthEntry.count += 1;
    monthTotals.set(monthKey, monthEntry);
  }
  const reports: IrrigationReport = {
    totalLiters: completed.reduce(
      (total, row) => total + Number(row.actualQuantityLiters),
      0,
    ),
    completedCount: completed.length,
    byCrop: [...cropTotals]
      .map(([crop, values]) => ({ crop, ...values }))
      .sort((a, b) => b.liters - a.liters),
    byMonth: [...monthTotals]
      .map(([month, values]) => ({
        month,
        label: new Intl.DateTimeFormat("en-IN", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${month}-01T12:00:00.000Z`)),
        ...values,
      }))
      .sort((a, b) => b.month.localeCompare(a.month)),
  };
  return (
    <SimpleIrrigationPlanner
      key={params.cycle ?? ""}
      initialCycleId={params.cycle}
      cycles={cycleData.filter(
        (cycle) => cycle.status === "PLANNED" || cycle.status === "ACTIVE",
      )}
      recordCycles={cycleData}
      history={historyData}
      reports={reports}
    />
  );
}
