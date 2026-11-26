import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { harvestTrackerEntry } from "@/lib/harvest-tracker";
import { recordHarvestLot, validHarvestDate } from "@/lib/record-harvest";

export async function GET() {
  const user = await getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const cycles = await db.cropCycle.findMany({
      where: {
        field: { farm: { userId: user.id } },
        OR: [
          { status: { in: ["PLANNED", "ACTIVE", "HARVESTED", "COMPLETED"] } },
          { actualHarvestDate: { not: null } },
        ],
      },
      select: {
        id: true,
        status: true,
        sowingDate: true,
        expectedHarvestDate: true,
        actualHarvestDate: true,
        cropDurationDays: true,
        growthStage: true,
        growthStageUpdatedAt: true,
        expectedHarvestQuantity: true,
        expectedHarvestUnit: true,
        crop: {
          select: {
            name: true,
            climateRequirement: { select: { cropDurationDays: true } },
          },
        },
        field: {
          select: {
            name: true,
            farm: { select: { name: true } },
          },
        },
      },
      orderBy: [{ actualHarvestDate: "desc" }, { id: "asc" }],
    });
    const now = new Date();
    return NextResponse.json(
      { crops: cycles.map((cycle) => harvestTrackerEntry(cycle, now)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Could not load harvest tracker", error);
    return NextResponse.json(
      { error: "Could not load harvest data." },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z
    .object({
      action: z.literal("harvested"),
      cropCycleId: z.string().min(1),
      harvestDate: z.iso.date(),
      quantity: z.number().min(0.001).max(999999999),
      unit: z.string().trim().min(1).max(24),
      quality: z.string().trim().max(80).optional(),
      storageDetails: z.string().trim().max(1000).optional(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request details" },
      { status: 400 },
    );
  const data = parsed.data;
  if (!validHarvestDate(data.harvestDate))
    return NextResponse.json(
      { error: "Enter a valid harvest date that is not in the future" },
      { status: 400 },
    );
  const result = await recordHarvestLot(
    user.id,
    { ...data, grade: data.quality },
    "confirm",
  );
  if (result.status === "missing")
    return NextResponse.json(
      { error: "Crop cycle not found" },
      { status: 404 },
    );
  if (result.status !== "saved")
    return NextResponse.json(
      { error: "Crop cycle already harvested; no duplicate lot created." },
      { status: 409 },
    );
  return NextResponse.json({
    success: true,
    yieldPerAcre: result.yieldPerAcre,
  });
}
