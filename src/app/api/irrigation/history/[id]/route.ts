import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { wateringRecordIdentity } from "@/lib/watering-record";

const litersSchema = z.number().positive().max(100_000_000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Water amount supports at most two decimal places.");
const editSchema = z.object({
  irrigationDate: z.string().date(),
  waterAppliedLiters: litersSchema,
  method: z.enum(["Drip Irrigation", "Sprinkler Irrigation", "Surface/Flood Irrigation", "Furrow"]),
  notes: z.string().max(500).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getUser();
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Check the date, water quantity, irrigation method, and notes." }, { status: 400 });
  const todayIndia = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (parsed.data.irrigationDate > todayIndia) return NextResponse.json({ success: false, error: "Irrigation date cannot be in the future." }, { status: 400 });
  const existing = await db.irrigationSchedule.findFirst({
    where: { id, userId: user.id, status: "COMPLETED", completedAt: { not: null }, isCheckOnly: false, actualQuantityLiters: { not: null } },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Completed watering record not found." }, { status: 404 });
  const entry = wateringRecordIdentity(parsed.data);
  const date = new Date(`${entry.irrigationDate}T12:00:00.000Z`);
  const updated = await db.irrigationSchedule.updateMany({
    where: { id: existing.id, userId: user.id, status: "COMPLETED", completedAt: { not: null }, isCheckOnly: false, actualQuantityLiters: { not: null } },
    data: { scheduledAt: date, completedAt: date, actualQuantityLiters: new Prisma.Decimal(entry.waterAppliedLiters), method: entry.method, notes: entry.notes },
  });
  if (!updated.count) return NextResponse.json({ success: false, error: "Completed watering record not found." }, { status: 404 });
  return NextResponse.json({ success: true, id: existing.id });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getUser();
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  const result = await db.irrigationSchedule.deleteMany({
    where: {
      id,
      userId: user.id,
      OR: [
        { status: "COMPLETED", completedAt: { not: null }, isCheckOnly: false, actualQuantityLiters: { not: null } },
        { status: "PLANNED", completedAt: null, isCheckOnly: true },
      ],
    },
  });
  if (!result.count) return NextResponse.json({ success: false, error: "Irrigation record not found." }, { status: 404 });
  return NextResponse.json({ success: true, id });
}
