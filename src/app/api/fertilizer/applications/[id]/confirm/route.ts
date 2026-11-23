import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { applicationConfirmation, confirmFertilizerApplication } from "@/lib/confirm-fertilizer-application";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!checkRateLimit(`fertilizer-confirm:${user.id}`, 20).allowed) return NextResponse.json({ error: "Try again in a minute." }, { status: 429 });
  const { id } = await params;
  const input = applicationConfirmation.safeParse(await request.json().catch(() => null));
  if (!input.success || !id || id.length > 64) return NextResponse.json({ error: "Check the application date, quantity and cost." }, { status: 400 });
  try {
    const result = await confirmFertilizerApplication(user.id, id, input.data);
    return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Could not confirm the application. Reload and retry with the same details." }, { status: 503 });
  }
}
