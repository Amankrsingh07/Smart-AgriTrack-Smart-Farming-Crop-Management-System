import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { id } = await params;
  const calendar = await db.cropCalendar.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!calendar)
    return NextResponse.json(
      { error: "Crop calendar not found." },
      { status: 404 },
    );
  const activities = await db.cropCalendarActivity.findMany({
    where: { calendarId: id },
    orderBy: { scheduledDate: "asc" },
  });
  return NextResponse.json({ data: activities });
}
