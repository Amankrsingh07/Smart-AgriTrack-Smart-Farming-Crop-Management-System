import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";

const patchSchema = z
  .object({
    scheduledDate: z.string().date().optional(),
    status: z.enum(["PENDING", "COMPLETED", "DELAYED"]).optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine(
    (value) =>
      value.scheduledDate !== undefined ||
      value.status !== undefined ||
      value.notes !== undefined,
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const { activityId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Provide a valid date, status or note." },
      { status: 400 },
    );
  const activity = await db.cropCalendarActivity.findFirst({
    where: { id: activityId, calendar: { userId: user.id } },
    select: {
      id: true,
      activityKey: true,
      calendar: { select: { cropCycleId: true, irrigationMethod: true } },
    },
  });
  if (!activity)
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  const date = parsed.data.scheduledDate
    ? new Date(`${parsed.data.scheduledDate}T00:00:00.000Z`)
    : undefined;
  if (activity.activityKey.startsWith("smart-fertilizer:"))
    return NextResponse.json(
      {
        error:
          "This activity is linked to a fertilizer application record and is read-only in the calendar.",
      },
      { status: 409 },
    );
  const updated = await db
    .$transaction(async (tx) => {
      const updated = await tx.cropCalendarActivity.update({
        where: { id: activityId, status: { not: "CANCELLED" } },
        data: {
          scheduledDate: date,
          status: parsed.data.status,
          actualCompletionDate:
            parsed.data.status === "COMPLETED"
              ? new Date()
              : parsed.data.status === "PENDING"
                ? null
                : undefined,
          notes: parsed.data.notes,
          isManuallyModified: true,
        },
      });
      if (activity.activityKey.startsWith("protection-")) {
        await tx.cropCalendarNotification.updateMany({
          where: {
            activityId,
            notificationDate: { not: updated.scheduledDate },
          },
          data: { isRead: true },
        });
        await tx.cropCalendarNotification.upsert({
          where: {
            activityId_notificationDate: {
              activityId,
              notificationDate: updated.scheduledDate,
            },
          },
          create: {
            userId: user.id,
            activityId,
            notificationDate: updated.scheduledDate,
            message: updated.activityName,
            isRead: updated.status === "COMPLETED",
          },
          update: {
            message: updated.activityName,
            isRead: updated.status === "COMPLETED",
          },
        });
        if (updated.activityType === "IRRIGATION_REVIEW") {
          const marker = `calendar:${activity.calendar.cropCycleId}:${activity.activityKey}`;
          if (updated.status === "COMPLETED")
            await tx.irrigationSchedule.deleteMany({
              where: {
                clientTransactionId: marker,
                completedAt: null,
                actualQuantityLiters: null,
              },
            });
          else {
            const schedule = await tx.irrigationSchedule.findUnique({
              where: { clientTransactionId: marker },
            });
            if (!schedule)
              await tx.irrigationSchedule.create({
                data: {
                  clientTransactionId: marker,
                  userId: user.id,
                  cropCycleId: activity.calendar.cropCycleId,
                  scheduledAt: updated.scheduledDate,
                  status: "PLANNED",
                  isCheckOnly: true,
                  method: activity.calendar.irrigationMethod,
                  recommendationSource: `CROP_CALENDAR_ACTIVITY:${activity.activityKey}`,
                  recommendationNotes:
                    "Check soil moisture and roots; no irrigation amount is prescribed.",
                },
              });
            else if (
              !schedule.completedAt &&
              schedule.actualQuantityLiters === null
            )
              await tx.irrigationSchedule.update({
                where: { id: schedule.id },
                data: { scheduledAt: updated.scheduledDate },
              });
          }
        }
      }
      return updated;
    })
    .catch((error) => {
      if (error?.code === "P2025") return null;
      throw error;
    });
  if (!updated)
    return NextResponse.json(
      { error: "This activity was cancelled." },
      { status: 409 },
    );
  return NextResponse.json({ data: updated });
}
