import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";

export async function POST(_request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { activityId } = await params;
  const activity = await db.cropCalendarActivity.findFirst({ where: { id: activityId, calendar: { userId: user.id } }, select: { id: true, activityKey: true, calendar: { select: { cropCycleId: true } } } });
  if (!activity) return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  const updated = await db.$transaction(async tx => {
    const result = await tx.cropCalendarActivity.update({ where: { id: activityId }, data: { status: "COMPLETED", actualCompletionDate: new Date(), isManuallyModified: true } });
    await tx.cropCalendarNotification.updateMany({ where: { activityId, userId: user.id }, data: { isRead: true } });
    await tx.irrigationSchedule.deleteMany({ where: { clientTransactionId: `calendar:${activity.calendar.cropCycleId}:${activity.activityKey}`, completedAt: null } });
    return result;
  });
  return NextResponse.json({ data: updated });
}
