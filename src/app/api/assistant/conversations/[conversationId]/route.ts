import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { assistantErrorResponse } from "@/lib/assistant-api-errors";

type Context = { params: Promise<{ conversationId: string }> };

async function handleGet(_request: Request, { params }: Context) {
  const user = await getUser({ throwDatabaseErrors: true });
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { conversationId } = await params;
  const conversation = await db.assistantConversation.findFirst({
    where: { id: conversationId, userId: user.id },
    select: { id: true, title: true, cropCycleId: true, updatedAt: true,
      messages: { orderBy: { sequence: "asc" }, select: { id: true, role: true, content: true, mode: true, advice: true, sources: true, createdAt: true } } },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ conversation }, { headers: { "Cache-Control": "private, no-store" } });
}

async function handleDelete(_request: Request, { params }: Context) {
  const user = await getUser({ throwDatabaseErrors: true });
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { conversationId } = await params;
  const deleted = await db.assistantConversation.deleteMany({ where: { id: conversationId, userId: user.id } });
  if (!deleted.count) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request, context: Context) {
  try { return await handleGet(request, context); }
  catch (error) { return assistantErrorResponse(error, "assistant.conversation.read"); }
}

export async function DELETE(request: Request, context: Context) {
  try { return await handleDelete(request, context); }
  catch (error) { return assistantErrorResponse(error, "assistant.conversation.delete"); }
}
