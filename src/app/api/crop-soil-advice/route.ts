import { fieldAdviceText } from "@/i18n/crop-advice/field";
import { getLocale } from "next-intl/server";
import { cropAdviceText } from "@/i18n/crop-advice";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { savedCropSoilAdvice } from "@/lib/saved-crop-soil-advice";
import { explainSoilReference } from "@/lib/soil-advice-online";

export async function POST(request: Request) {
  const locale = await getLocale();
  const t = (text: string) => cropAdviceText(text, locale);
  const user = await getUser();
  if (!user) return NextResponse.json({ error: t("Please sign in again.") }, { status: 401 });
  if (!checkRateLimit(`crop-soil-advice:${user.id}`).allowed) return NextResponse.json({ error: t("Too many requests. Offline soil details remain available below.") }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: t("Invalid JSON request.") }, { status: 400 }); }
  const parsed = z.object({ cropCycleId: z.string().min(1).max(100) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: t("Select a saved crop.") }, { status: 400 });
  const cycle = await db.cropCycle.findFirst({ where: { id: parsed.data.cropCycleId, field: { farm: { userId: user.id } } }, include: { crop: true, field: { include: { farm: true } } } });
  if (!cycle) return NextResponse.json({ error: t("Saved crop not found.") }, { status: 404 });
  const input = { crop: cycle.crop.name, soil: cycle.field.soilType, state: cycle.field.farm.state, district: cycle.field.farm.district, ph: cycle.field.soilPh?.toNumber() ?? null, texture: cycle.field.soilTexture };
  const reference = savedCropSoilAdvice(input);
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return NextResponse.json({ mode: "offline", message: t("Online AI is not configured. The source-backed offline soil reference is available on this page.") });
  try {
    const approvedTips = [fieldAdviceText(locale, "soilCheck"), fieldAdviceText(locale, "checkMoisture"),
      fieldAdviceText(locale, "limits")];
    const explanation = await explainSoilReference(input, reference, apiKey, process.env.GEMINI_MODEL || "gemini-3.8-flash", fetch, locale, approvedTips);
    return NextResponse.json({ mode: "online", message: t("AI explanation uses the bundled references; no live web search or soil measurement was performed."), ...explanation });
  } catch {
    return NextResponse.json({ mode: "offline", message: t("Online explanation could not be verified or the provider is unavailable. Use the source-backed offline soil reference on this page.") });
  }
}
