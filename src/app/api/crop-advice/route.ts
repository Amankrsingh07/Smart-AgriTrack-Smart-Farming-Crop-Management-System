import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOfflineCropAdvice } from "@/lib/crop-advice-catalog";

const schema = z.object({ state: z.string().trim().min(2).max(80), district: z.string().trim().min(2).max(100), soilType: z.string().trim().min(2).max(80) });
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const rate = checkRateLimit(`crop-advice:${user.id}`);
  if (!rate.allowed) return NextResponse.json({ error: "Too many crop advice requests. Please wait a minute and try again." }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body was not valid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose a state, district, and soil type." }, { status: 400 });
  const { state, district, soilType } = parsed.data;
  return NextResponse.json({ ...getOfflineCropAdvice(state, district, soilType), mode: "offline" });
}
