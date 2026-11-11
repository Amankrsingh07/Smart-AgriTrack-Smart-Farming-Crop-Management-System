export type CropCycleDisplayStatus = "UPCOMING" | "GROWING" | "HARVEST_DUE" | "HARVEST_OVERDUE" | "HARVEST_COMPLETED";

export function indiaDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dateOnlyInIndia(date: Date): Date {
  return new Date(`${indiaDateKey(date)}T00:00:00.000Z`);
}

export function deriveCropCycleDisplayStatus(
  cycle: { status: string; sowingDate: Date | null; expectedHarvestDate: Date | null; actualHarvestDate: Date | null },
  now = new Date(),
): CropCycleDisplayStatus | null {
  if (cycle.actualHarvestDate || cycle.status === "HARVESTED") return "HARVEST_COMPLETED";

  const today = indiaDateKey(now);
  const sowing = cycle.sowingDate ? indiaDateKey(cycle.sowingDate) : null;
  const plannedHarvest = cycle.expectedHarvestDate ? indiaDateKey(cycle.expectedHarvestDate) : null;

  if (sowing && today < sowing) return "UPCOMING";
  if (plannedHarvest && today === plannedHarvest) return "HARVEST_DUE";
  if (plannedHarvest && today > plannedHarvest) return "HARVEST_OVERDUE";
  if (sowing && today >= sowing && (!plannedHarvest || today < plannedHarvest)) return "GROWING";
  return null;
}
