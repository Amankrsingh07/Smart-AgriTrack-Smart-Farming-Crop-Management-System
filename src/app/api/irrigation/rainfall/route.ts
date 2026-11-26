import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import {
  calculateEffectiveRainfall,
  rainfallCreditEligibility,
  rainfallTransactionFingerprint,
} from "@/lib/rainfall-water-balance";

const amount = z
  .number()
  .min(0)
  .max(1000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7);
const schema = z.object({
  transactionId: z.string().uuid(),
  cropCycleId: z.string().min(1),
  rainfallDate: z.string().date(),
  grossRainfallMm: amount,
  source: z.enum(["MANUAL_OBSERVATION", "WEATHER_STATION", "FORECAST"]),
  runoffLossMm: amount.optional(),
  moistureMeasuredDate: z.string().date(),
  fieldCapacityPercent: z.number().min(0).max(100).optional(),
  currentPercent: z.number().min(0).max(100).optional(),
  rootZoneDepthM: z.number().min(0.05).max(3).optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: "Authentication required." },
      { status: 401 },
    );
  const cycleId = new URL(request.url).searchParams.get("cropCycleId");
  const cycle = cycleId
    ? await db.cropCycle.findFirst({
        where: { id: cycleId, field: { farm: { userId: user.id } } },
        select: { id: true },
      })
    : null;
  if (!cycle)
    return NextResponse.json(
      { success: false, error: "Crop cycle not found." },
      { status: 404 },
    );
  const rows = await db.rainfallObservation.findMany({
    where: { userId: user.id, cropCycleId: cycle.id },
    orderBy: [{ rainfallDate: "desc" }, { recordedAt: "desc" }],
  });
  return NextResponse.json({
    success: true,
    data: rows.map((row) => ({
      id: row.id,
      cropCycleId: row.cropCycleId,
      date: row.rainfallDate.toISOString().slice(0, 10),
      moistureMeasuredDate:
        row.moistureMeasuredDate?.toISOString().slice(0, 10) ?? null,
      grossRainfallMm: Number(row.grossRainfallMm),
      runoffLossMm: row.runoffLossMm === null ? null : Number(row.runoffLossMm),
      drainageLossMm:
        row.drainageLossMm === null ? null : Number(row.drainageLossMm),
      effectiveRainfallMm:
        row.effectiveRainfallMm === null
          ? null
          : Number(row.effectiveRainfallMm),
      source: row.source,
      calculationStatus: row.calculationStatus,
      notes: row.notes,
      recordedAt: row.recordedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user)
    return NextResponse.json(
      { success: false, error: "Authentication required." },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      {
        success: false,
        error:
          "Check the rainfall amount, date, source, and measured soil inputs.",
      },
      { status: 400 },
    );
  const todayIndia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (parsed.data.moistureMeasuredDate > todayIndia)
    return NextResponse.json(
      {
        success: false,
        error: "Soil moisture measurement date cannot be in the future.",
      },
      { status: 400 },
    );
  const creditStatus = rainfallCreditEligibility({
    source: parsed.data.source,
    rainfallDate: parsed.data.rainfallDate,
    moistureMeasuredDate: parsed.data.moistureMeasuredDate,
    today: todayIndia,
  });
  if (creditStatus === "OBSERVATION_FUTURE_DATED")
    return NextResponse.json(
      {
        success: false,
        error: "Observed rainfall cannot be dated in the future.",
      },
      { status: 400 },
    );
  if (
    parsed.data.runoffLossMm !== undefined &&
    parsed.data.runoffLossMm > parsed.data.grossRainfallMm
  )
    return NextResponse.json(
      { success: false, error: "Runoff loss cannot exceed gross rainfall." },
      { status: 400 },
    );
  const cycle = await db.cropCycle.findFirst({
    where: {
      id: parsed.data.cropCycleId,
      field: { farm: { userId: user.id } },
    },
    select: { id: true },
  });
  if (!cycle)
    return NextResponse.json(
      { success: false, error: "Crop cycle not found." },
      { status: 404 },
    );

  const existing = await db.rainfallObservation.findUnique({
    where: { clientTransactionId: parsed.data.transactionId },
  });
  if (existing) {
    const existingIdentity = {
      transactionId: existing.clientTransactionId ?? "",
      userId: existing.userId,
      cropCycleId: existing.cropCycleId,
      rainfallDate: existing.rainfallDate.toISOString().slice(0, 10),
      moistureMeasuredDate:
        existing.moistureMeasuredDate?.toISOString().slice(0, 10) ?? "",
      grossRainfallMm: Number(existing.grossRainfallMm),
      source: existing.source,
      runoffLossMm:
        existing.runoffLossMm === null ? null : Number(existing.runoffLossMm),
      fieldCapacityPercent:
        existing.soilFieldCapacityPercent === null
          ? null
          : Number(existing.soilFieldCapacityPercent),
      currentPercent:
        existing.soilCurrentMoisturePercent === null
          ? null
          : Number(existing.soilCurrentMoisturePercent),
      rootZoneDepthM:
        existing.soilRootZoneDepthM === null
          ? null
          : Number(existing.soilRootZoneDepthM),
      notes: existing.notes,
    };
    const requestIdentity = {
      ...parsed.data,
      userId: user.id,
      cropCycleId: cycle.id,
    };
    const identical =
      rainfallTransactionFingerprint(existingIdentity) ===
      rainfallTransactionFingerprint(requestIdentity);
    return identical
      ? NextResponse.json(
          {
            success: true,
            id: existing.id,
            duplicate: true,
            grossRainfallMm: Number(existing.grossRainfallMm),
            effectiveRainfallMm:
              existing.effectiveRainfallMm === null
                ? null
                : Number(existing.effectiveRainfallMm),
            drainageLossMm:
              existing.drainageLossMm === null
                ? null
                : Number(existing.drainageLossMm),
            calculationStatus: existing.calculationStatus,
          },
          { status: 200 },
        )
      : NextResponse.json(
          {
            success: false,
            error:
              "This rainfall transaction ID was used for a different observation.",
          },
          { status: 409 },
        );
  }

  let effectiveRainfallMm: number | null = null;
  const runoffLossMm: number | null = parsed.data.runoffLossMm ?? null;
  let drainageLossMm: number | null = null;
  let calculationStatus = "INSUFFICIENT_MEASUREMENTS";
  if (creditStatus !== "ELIGIBLE") calculationStatus = creditStatus;
  else if (
    runoffLossMm !== null &&
    parsed.data.fieldCapacityPercent !== undefined &&
    parsed.data.currentPercent !== undefined &&
    parsed.data.rootZoneDepthM !== undefined &&
    parsed.data.fieldCapacityPercent >= parsed.data.currentPercent
  ) {
    const estimate = calculateEffectiveRainfall({
      grossRainfallMm: parsed.data.grossRainfallMm,
      runoffLossMm,
      fieldCapacityPercent: parsed.data.fieldCapacityPercent,
      currentMoisturePercent: parsed.data.currentPercent,
      rootZoneDepthM: parsed.data.rootZoneDepthM,
    });
    effectiveRainfallMm = estimate.effectiveRainfallMm;
    drainageLossMm = estimate.drainageLossMm;
    calculationStatus = estimate.status;
  }

  try {
    const created = await db.rainfallObservation.create({
      data: {
        clientTransactionId: parsed.data.transactionId,
        userId: user.id,
        cropCycleId: cycle.id,
        rainfallDate: new Date(`${parsed.data.rainfallDate}T12:00:00.000Z`),
        moistureMeasuredDate: new Date(
          `${parsed.data.moistureMeasuredDate}T12:00:00.000Z`,
        ),
        soilFieldCapacityPercent:
          parsed.data.fieldCapacityPercent === undefined
            ? null
            : new Prisma.Decimal(parsed.data.fieldCapacityPercent),
        soilCurrentMoisturePercent:
          parsed.data.currentPercent === undefined
            ? null
            : new Prisma.Decimal(parsed.data.currentPercent),
        soilRootZoneDepthM:
          parsed.data.rootZoneDepthM === undefined
            ? null
            : new Prisma.Decimal(parsed.data.rootZoneDepthM),
        grossRainfallMm: new Prisma.Decimal(parsed.data.grossRainfallMm),
        runoffLossMm:
          runoffLossMm === null ? null : new Prisma.Decimal(runoffLossMm),
        drainageLossMm:
          drainageLossMm === null ? null : new Prisma.Decimal(drainageLossMm),
        effectiveRainfallMm:
          effectiveRainfallMm === null
            ? null
            : new Prisma.Decimal(effectiveRainfallMm),
        source: parsed.data.source,
        calculationStatus,
        notes: parsed.data.notes?.trim() || null,
      },
      select: { id: true },
    });
    return NextResponse.json(
      {
        success: true,
        id: created.id,
        duplicate: false,
        grossRainfallMm: parsed.data.grossRainfallMm,
        effectiveRainfallMm,
        drainageLossMm,
        calculationStatus,
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    )
      return NextResponse.json(
        {
          success: false,
          error:
            "This rainfall transaction was already submitted. Refresh the rainfall history.",
        },
        { status: 409 },
      );
    throw error;
  }
}
