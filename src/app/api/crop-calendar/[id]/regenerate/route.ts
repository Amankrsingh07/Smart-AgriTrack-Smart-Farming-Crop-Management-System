import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { generateCalendarForCycle } from "@/lib/crop-calendar-service";

export async function POST(
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
    select: { cropCycleId: true },
  });
  if (!calendar)
    return NextResponse.json(
      { error: "Crop calendar not found." },
      { status: 404 },
    );
  try {
    const result = await generateCalendarForCycle(user.id, {
      cropCycleId: calendar.cropCycleId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Could not regenerate the crop calendar.",
      },
      { status: 400 },
    );
  }
}
