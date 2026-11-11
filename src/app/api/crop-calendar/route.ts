import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const calendars = await db.cropCalendar.findMany({
    where: { userId: user.id },
    include: { crop: { select: { name: true } }, farm: { select: { name: true } }, cropCycle: { include: { field: { select: { name: true } } } }, activities: { orderBy: { scheduledDate: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: calendars });
}
