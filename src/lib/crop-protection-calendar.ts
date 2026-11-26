import type { Prisma } from "@prisma/client";
import {
  protectionPlanDate,
  type ProtectionPlanItem,
} from "./crop-protection-plan";
export async function scheduleProtectionPlan(
  tx: Prisma.TransactionClient,
  assessment: {
    id: string;
    userId: string;
    cropName: string;
    cropCycleId: string | null;
  },
  plan: ProtectionPlanItem[],
  now = new Date(),
) {
  // Serialize against concurrent retries and other protection assessments for this user.
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${assessment.userId} FOR UPDATE`;
  const key = `crop-protection-followup:${assessment.id}`;
  if (
    await tx.alert.findUnique({
      where: {
        userId_dedupeKey: { userId: assessment.userId, dedupeKey: key },
      },
    })
  )
    return { created: false, count: 0 };
  const calendar = assessment.cropCycleId
    ? await tx.cropCalendar.findFirst({
        where: {
          userId: assessment.userId,
          cropCycleId: assessment.cropCycleId,
          status: "ACTIVE",
        },
        select: { id: true, irrigationMethod: true },
      })
    : null;
  if (calendar)
    await tx.$queryRaw`SELECT id FROM CropCalendar WHERE id = ${calendar.id} FOR UPDATE`;
  let count = 0;
  for (const item of plan) {
    const date = protectionPlanDate(now, item.days);
    const title = item.title.slice(0, 120);
    if (calendar) {
      const activityType =
        item.key === "root-moisture"
          ? "IRRIGATION_REVIEW"
          : ["inspect", "weather-scout"].includes(item.key)
            ? "PEST_MONITORING"
            : "PROTECTION_REVIEW";
      // Reuse the existing crop plan's scouting/moisture task on the same day.
      const existing = await tx.cropCalendarActivity.findFirst({
        where: {
          calendarId: calendar.id,
          scheduledDate: date,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
          ...(activityType === "PROTECTION_REVIEW"
            ? { activityKey: { startsWith: `protection-${item.key}-` } }
            : { activityType }),
        },
      });
      if (existing) continue;
      const activity = await tx.cropCalendarActivity.create({
        data: {
          calendarId: calendar.id,
          activityKey: `protection-${item.key}-${assessment.id}-${date.toISOString().slice(0, 10)}`,
          activityName: title,
          activityType,
          scheduledDate: date,
          description: item.reason,
          recommendation: item.action,
          source: "Crop protection preliminary rules",
          notes: `Report: /crop-protection/${assessment.id}`,
        },
      });
      await tx.cropCalendarNotification.upsert({
        where: {
          activityId_notificationDate: {
            activityId: activity.id,
            notificationDate: date,
          },
        },
        create: {
          userId: assessment.userId,
          activityId: activity.id,
          notificationDate: date,
          message: title,
        },
        update: {},
      });
      if (item.key === "root-moisture" && assessment.cropCycleId) {
        const marker = `calendar:${assessment.cropCycleId}:${activity.activityKey}`;
        if (
          !(await tx.irrigationSchedule.findFirst({
            where: { clientTransactionId: marker },
          }))
        )
          await tx.irrigationSchedule.create({
            data: {
              clientTransactionId: marker,
              userId: assessment.userId,
              cropCycleId: assessment.cropCycleId,
              scheduledAt: date,
              status: "PLANNED",
              isCheckOnly: true,
              method: calendar.irrigationMethod,
              recommendationSource: `CROP_CALENDAR_ACTIVITY:${activity.activityKey}`,
              recommendationNotes:
                "Check root-zone moisture and drainage; no irrigation quantity or contaminated-water clearance is implied.",
            },
          });
      }
    } else {
      // Manual assessments have no crop cycle: include crop name so unrelated crops do not dedupe together.
      const existing = await tx.cropCalendarEvent.findFirst({
        where: {
          userId: assessment.userId,
          cropCycleId: assessment.cropCycleId,
          eventDate: date,
          title,
        },
      });
      if (existing) continue;
      await tx.cropCalendarEvent.create({
        data: {
          userId: assessment.userId,
          cropCycleId: assessment.cropCycleId,
          title,
          eventDate: date,
          notes:
            `${item.action} Report: /crop-protection/${assessment.id}`.slice(
              0,
              500,
            ),
        },
      });
    }
    count++;
  }
  await tx.alert.create({
    data: {
      userId: assessment.userId,
      dedupeKey: key,
      title: "Crop protection plan ready",
      message: `${count} new follow-up activities for ${assessment.cropName}; existing matching calendar tasks reused. Review promptly if damage spreads.`,
      href: `/crop-protection/${assessment.id}`,
    },
  });
  return { created: count > 0, count };
}
