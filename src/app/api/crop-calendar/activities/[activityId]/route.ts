import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";

const patchSchema = z.object({ scheduledDate: z.string().date().optional(), status: z.enum(["PENDING", "COMPLETED", "DELAYED"]).optional(), notes: z.string().max(500).nullable().optional() }).refine(value => value.scheduledDate !== undefined || value.status !== undefined || value.notes !== undefined);

export async function PATCH(request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { activityId } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Send valid JSON." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a valid date, status or note." }, { status: 400 });
  const activity = await db.cropCalendarActivity.findFirst({ where: { id: activityId, calendar: { userId: user.id } }, select: { id: true } });
  if (!activity) return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  const date = parsed.data.scheduledDate ? new Date(`${parsed.data.scheduledDate}T00:00:00.000Z`) : undefined;
  const updated = await db.cropCalendarActivity.update({ where: { id: activityId }, data: {
    scheduledDate: date,
    status: parsed.data.status,
    actualCompletionDate: parsed.data.status === "COMPLETED" ? new Date() : parsed.data.status === "PENDING" ? null : undefined,
    notes: parsed.data.notes,
    isManuallyModified: true,
  } });
  return NextResponse.json({ data: updated });
}
