import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const calendar = await db.cropCalendar.findFirst({ where: { id, userId: user.id }, include: { crop: true, farm: true, cropCycle: { include: { field: true } }, activities: { orderBy: { scheduledDate: "asc" } } } });
  if (!calendar) return NextResponse.json({ error: "Crop calendar not found." }, { status: 404 });
  return NextResponse.json({ data: calendar });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  const result = await db.cropCalendar.deleteMany({ where: { id, userId: user.id } });
  if (!result.count) return NextResponse.json({ error: "Crop calendar not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
