import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { assistantErrorResponse } from "@/lib/assistant-api-errors";

const createSchema = z.object({ cropCycleId: z.string().trim().min(1).max(100).optional() }).strict();

async function handleGet() {
  const user = await getUser({ throwDatabaseErrors: true });
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const conversations = await db.assistantConversation.findMany({
    where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 60,
    select: { id: true, title: true, updatedAt: true, cropCycleId: true, _count: { select: { messages: true } } },
  });
  return NextResponse.json({ conversations }, { headers: { "Cache-Control": "private, no-store" } });
}

async function handlePost(request: Request) {
  const user = await getUser({ throwDatabaseErrors: true });
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid conversation details." }, { status: 400 });
  if (parsed.data.cropCycleId && !await db.cropCycle.findFirst({
    where: { id: parsed.data.cropCycleId, field: { farm: { userId: user.id } } }, select: { id: true },
  })) return NextResponse.json({ error: "Crop cycle not found." }, { status: 404 });
  const conversation = await db.assistantConversation.create({
    data: { userId: user.id, cropCycleId: parsed.data.cropCycleId ?? null, title: "New Chat" },
    select: { id: true, title: true, updatedAt: true, cropCycleId: true },
  });
  return NextResponse.json({ conversation }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  try { return await handleGet(); }
  catch (error) { return assistantErrorResponse(error, "assistant.conversations.list"); }
}

export async function POST(request: Request) {
  try { return await handlePost(request); }
  catch (error) { return assistantErrorResponse(error, "assistant.conversations.create"); }
}
