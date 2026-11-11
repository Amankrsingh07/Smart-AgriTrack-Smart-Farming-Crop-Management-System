import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { languages } from "@/i18n/languages";

const schema = z.object({ language: z.enum(languages.map(item => item.code) as [string, ...string[]]) });
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Select a supported language." }, { status: 400 });
  const user = await getUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { language: parsed.data.language } });
  (await cookies()).set("agritrack_locale", parsed.data.language, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return NextResponse.json({ ok: true, language: parsed.data.language });
}
