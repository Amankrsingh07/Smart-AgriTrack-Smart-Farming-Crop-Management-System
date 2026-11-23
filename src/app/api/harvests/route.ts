import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { expectedHarvestDate, harvestStatus } from "@/lib/harvest";
import { recordHarvestLot, validHarvestDate } from "@/lib/record-harvest";

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
    return { id: c.id, crop: c.crop.name, field: c.field.name, farm: c.field.farm.name, growthStage: c.growthStage, date: date?.toISOString().slice(0, 10) ?? null, actualHarvestDate: c.actualHarvestDate?.toISOString().slice(0, 10) ?? null, expectedHarvestQuantity: c.expectedHarvestQuantity?.toString() ?? null, expectedHarvestUnit: c.expectedHarvestUnit ?? null, status: harvestStatus(c), href: `/crops#cycle-${encodeURIComponent(c.id)}` };
  }) });
}

export async function PATCH(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ action: z.literal("harvested"), cropCycleId: z.string().min(1), harvestDate: z.iso.date(), quantity: z.number().min(0.001).max(999999999), unit: z.string().trim().min(1).max(24), quality: z.string().trim().max(80).optional(), storageDetails: z.string().trim().max(1000).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request details" }, { status: 400 });
  const data = parsed.data;
  if (!validHarvestDate(data.harvestDate)) return NextResponse.json({ error: "Enter a valid harvest date that is not in the future" }, { status: 400 });
  const result = await recordHarvestLot(user.id, { ...data, grade: data.quality }, "confirm");
  if (result.status === "missing") return NextResponse.json({ error: "Crop cycle not found" }, { status: 404 });
  if (result.status !== "saved") return NextResponse.json({ error: "Crop cycle already harvested; no duplicate lot created." }, { status: 409 });
  return NextResponse.json({ success: true, yieldPerAcre: result.yieldPerAcre });
}
