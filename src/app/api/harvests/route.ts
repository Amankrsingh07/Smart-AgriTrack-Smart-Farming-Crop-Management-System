import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { calculateYieldPerAcre, expectedHarvestDate, harvestStatus } from "@/lib/harvest";
import { dateOnlyInIndia, indiaDateKey } from "@/lib/crop-cycle-status";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cycles = await db.cropCycle.findMany({
    where: { field: { farm: { userId: user.id } }, status: { in: ["PLANNED", "ACTIVE", "HARVESTED"] } },
    include: { crop: { include: { climateRequirement: true } }, field: { include: { farm: true } } },
    orderBy: [{ actualHarvestDate: "desc" }, { expectedHarvestDate: "asc" }], take: 100,
  });
  return NextResponse.json({ crops: cycles.map(c => {
    const date = expectedHarvestDate(c);
    return { id: c.id, crop: c.crop.name, field: c.field.name, farm: c.field.farm.name, growthStage: c.growthStage, date: date?.toISOString().slice(0, 10) ?? null, actualHarvestDate: c.actualHarvestDate?.toISOString().slice(0, 10) ?? null, status: harvestStatus(c), href: `/crops#cycle-${encodeURIComponent(c.id)}` };
  }) });
}

export async function PATCH(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ action: z.literal("harvested"), cropCycleId: z.string().min(1), harvestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), quantity: z.number().positive().max(999999999), unit: z.string().trim().min(1).max(24), quality: z.string().trim().max(80).optional(), storageDetails: z.string().trim().max(1000).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request details" }, { status: 400 });
  const data = parsed.data;
  const timestamp = Date.parse(`${data.harvestDate}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== data.harvestDate || data.harvestDate > indiaDateKey(new Date())) return NextResponse.json({ error: "Enter a valid harvest date that is not in the future" }, { status: 400 });
  const cycle = await db.cropCycle.findFirst({ where: { id: data.cropCycleId, field: { farm: { userId: user.id } }, actualHarvestDate: null }, include: { field: true } });
  if (!cycle) return NextResponse.json({ error: "Crop cycle not found or already harvested" }, { status: 404 });
  const harvestDate = dateOnlyInIndia(new Date(`${data.harvestDate}T12:00:00+05:30`));
  const yieldPerAcre = calculateYieldPerAcre(data.quantity, data.unit, Number(cycle.field.area), cycle.field.areaUnit);
  await db.$transaction(async tx => {
    await tx.production.create({ data: { cropCycleId: cycle.id, harvestDate, quantity: data.quantity, unit: data.unit, grade: data.quality || null, storageDetails: data.storageDetails || null, yieldPerAcre } });
    await tx.cropCycle.update({ where: { id: cycle.id }, data: { status: "HARVESTED", actualHarvestDate: harvestDate } });
  });
  return NextResponse.json({ success: true, yieldPerAcre });
}
