import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { cropGrowthStages as growthStages } from "@/lib/crop-growth-stages";
import { analyzeSoil } from "@/lib/soil-health";

const schema = z.object({
  state: z.string().trim().min(2).max(80),
  district: z.string().trim().min(2).max(100),
  crop: z.string().trim().min(2).max(80),
  growthStage: z.enum(growthStages),
  soilType: z.string().trim().min(2).max(60),
  nitrogenKgHa: z.number().finite().min(0).max(100_000),
  phosphorusKgHa: z.number().finite().min(0).max(100_000),
  potassiumKgHa: z.number().finite().min(0).max(100_000),
  soilPh: z.number().finite().min(0).max(14).optional(),
});

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const rate = checkRateLimit(`soil-health:${user.id}`);
  if (!rate.allowed) return NextResponse.json({ error: "Too many soil checks. Please try again in a minute." }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body was not valid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid location, crop, growth stage, soil type, and NPK results. pH is optional." }, { status: 400 });

  const result = analyzeSoil(parsed.data);
  try {
    const saved = await db.fertilizerRecommendationHistory.create({
      data: {
        userId: user.id,
        input: { ...parsed.data, soilPh: parsed.data.soilPh ?? null } as Prisma.InputJsonValue,
        result: result as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    });
    return NextResponse.json({ id: saved.id, createdAt: saved.createdAt.toISOString(), result });
  } catch {
    return NextResponse.json({ error: "Soil check could not be saved. Check that the local database migration is applied." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body was not valid JSON." }, { status: 400 }); }
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose a saved recommendation to delete." }, { status: 400 });
  const deleted = await db.fertilizerRecommendationHistory.deleteMany({ where: { id: parsed.data.id, userId: user.id } });
  if (!deleted.count) return NextResponse.json({ error: "Saved recommendation not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}

