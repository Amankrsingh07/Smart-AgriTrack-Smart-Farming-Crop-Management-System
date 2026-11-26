import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { analyzeSoil } from "@/lib/soil-health";
import {
  soilHealthSchema,
  soilValidationError,
} from "@/lib/soil-health-validation";

export async function POST(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  const rate = checkRateLimit(`soil-health:${user.id}`);
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Too many soil checks. Please try again in a minute." },
      { status: 429 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body was not valid JSON." },
      { status: 400 },
    );
  }
  const parsed = soilHealthSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: soilValidationError(parsed.error.issues[0]) },
      { status: 400 },
    );

  const result = analyzeSoil(parsed.data);
  const input = { ...parsed.data, soilPh: parsed.data.soilPh ?? null };
  try {
    if (parsed.data.cropCycleId) {
      const cycle = await db.cropCycle.findFirst({
        where: {
          id: parsed.data.cropCycleId,
          cropId: parsed.data.cropId,
          fieldId: parsed.data.fieldId,
          field: { farmId: parsed.data.farmId, farm: { userId: user.id } },
        },
        select: { id: true },
      });
      if (!cycle)
        return NextResponse.json(
          { error: "The selected crop cycle does not belong to your farm." },
          { status: 403 },
        );
    } else if (parsed.data.fieldId) {
      const field = await db.field.findFirst({
        where: {
          id: parsed.data.fieldId,
          farmId: parsed.data.farmId,
          farm: { userId: user.id },
        },
        select: { id: true },
      });
      if (!field)
        return NextResponse.json(
          { error: "The selected field does not belong to your farm." },
          { status: 403 },
        );
    }
    const saved = await db.fertilizerRecommendationHistory.create({
      data: {
        userId: user.id,
        input: input as Prisma.InputJsonValue,
        result: result as Prisma.InputJsonValue,
        farmId: parsed.data.farmId,
        fieldId: parsed.data.fieldId,
        cropId: parsed.data.cropId,
        cropCycleId: parsed.data.cropCycleId,
        sampleDate: parsed.data.sampleDate
          ? new Date(`${parsed.data.sampleDate}T00:00:00.000Z`)
          : undefined,
      },
      select: { id: true, createdAt: true },
    });
    return NextResponse.json({
      id: saved.id,
      createdAt: saved.createdAt.toISOString(),
      input,
      result,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Soil check could not be saved. Check that the local database migration is applied.",
      },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body was not valid JSON." },
      { status: 400 },
    );
  }
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Choose a saved recommendation to delete." },
      { status: 400 },
    );
  const deleted = await db.fertilizerRecommendationHistory.deleteMany({
    where: { id: parsed.data.id, userId: user.id },
  });
  if (!deleted.count)
    return NextResponse.json(
      { error: "Saved recommendation not found." },
      { status: 404 },
    );
  return NextResponse.json({ success: true });
}
