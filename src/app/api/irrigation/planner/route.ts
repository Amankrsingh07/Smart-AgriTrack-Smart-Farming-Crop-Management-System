import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { calculateSimpleIrrigation } from "@/lib/simple-irrigation-planner";
import plannerConfig from "@/data/irrigation/simple-planner.json";
import { geocodeIndianDistrict, loadOpenMeteoForecast } from "@/lib/open-meteo";
import { addCalendarDays, dateAtUtcNoon, indiaCalendarDate } from "@/lib/irrigation-dates";

const schema = z.object({
  cropCycleId: z.string().min(1),
  soil: z.enum(["Sandy Soil", "Sandy Loam", "Loamy Soil", "Clay Loam", "Clay Soil"]),
  growthStage: z.enum(plannerConfig.stages as [string, ...string[]]),
  method: z.enum(plannerConfig.methods as [string, ...string[]]),
  weatherMode: z.enum(["offline", "live"]).default("offline"),
  moisture: z.object({
    fieldCapacityPercent: z.number().min(0).max(100).optional(),
    wiltingPointPercent: z.number().min(0).max(100).optional(),
    currentPercent: z.number().min(0).max(100).optional(),
    rootZoneDepthM: z.number().min(0.05).max(3).optional(),
  }).optional(),
  moistureMeasuredDate: z.string().date().optional(),
  calculationDate: z.string().date().optional(),
  manualRainfallScenarioMm: z.number().finite().min(0).max(1000).optional(),
  save: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const rate = checkRateLimit(`irrigation-planner:${user.id}`, 20, 60_000);
  if (!rate.allowed) return NextResponse.json({ success: false, error: "Too many irrigation calculations. Please wait a minute and try again." }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Check the crop, soil, growth stage, method, and watering interval." }, { status: 400 });

  const cycle = await db.cropCycle.findFirst({
    where: { id: parsed.data.cropCycleId, actualHarvestDate: null, status: { in: ["PLANNED", "ACTIVE"] }, field: { farm: { userId: user.id } } },
    select: { id: true, crop: { select: { name: true } }, growthStage: true, field: { select: { area: true, areaUnit: true, farm: { select: { state: true, district: true, latitude: true, longitude: true } } } } },
  });
  if (!cycle) return NextResponse.json({ success: false, error: "Crop cycle not found." }, { status: 404 });
  const today = indiaCalendarDate();
  const calculationDate = parsed.data.calculationDate ?? today;
  const moistureMeasuredDate = parsed.data.moistureMeasuredDate ?? today;
  if (calculationDate < today) return NextResponse.json({ success: false, error: "Calculation date cannot be in the past." }, { status: 400 });
  if (moistureMeasuredDate > today || moistureMeasuredDate > calculationDate) return NextResponse.json({ success: false, error: "Soil moisture measurement date cannot be in the future or after the calculation date." }, { status: 400 });
  let liveEt0MmDay: number | undefined;
  let liveWeatherDate: string | undefined;
  let forecastRainfallMm: number | undefined;
  let forecastRainfallDate: string | undefined;
  let weatherRetrievedAt: string | undefined;
  if (parsed.data.weatherMode === "live") {
    try {
      const { latitude, longitude, district, state } = cycle.field.farm;
      const location = latitude !== null && longitude !== null
        ? { latitude: Number(latitude), longitude: Number(longitude) }
        : await geocodeIndianDistrict(district, state);
      if (location) {
        const liveForecast = await loadOpenMeteoForecast(location.latitude, location.longitude);
        const dateIndex = liveForecast.daily.time.indexOf(calculationDate);
        const candidate = dateIndex >= 0 ? liveForecast.daily.et0_fao_evapotranspiration?.[dateIndex] : undefined;
        if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) { liveEt0MmDay = candidate; liveWeatherDate = calculationDate; }
        const rainfallCandidate = dateIndex >= 0 ? liveForecast.daily.precipitation_sum[dateIndex] : undefined;
        if (typeof rainfallCandidate === "number" && Number.isFinite(rainfallCandidate) && rainfallCandidate >= 0) { forecastRainfallMm = rainfallCandidate; forecastRainfallDate = calculationDate; }
        weatherRetrievedAt = new Date().toISOString();
      }
    } catch { /* The result will explain that live ETo is missing; no offline substitution. */ }
  }
  const observationStart = new Date(`${moistureMeasuredDate}T00:00:00.000Z`);
  const observationEnd = new Date(`${calculationDate}T23:59:59.999Z`);
  const forecastEnd = dateAtUtcNoon(addCalendarDays(calculationDate, 7));
  const [rainRows, irrigationRows] = parsed.data.moisture ? await Promise.all([
    db.rainfallObservation.findMany({ where: { userId: user.id, cropCycleId: cycle.id, OR: [{ source: { in: ["MANUAL_OBSERVATION", "WEATHER_STATION"] }, rainfallDate: { gt: observationStart, lte: observationEnd } }, { source: "FORECAST", rainfallDate: { gte: dateAtUtcNoon(calculationDate), lte: forecastEnd } }] }, select: { rainfallDate: true, moistureMeasuredDate: true, grossRainfallMm: true, effectiveRainfallMm: true, source: true, recordedAt: true }, orderBy: { rainfallDate: "asc" } }),
    db.irrigationSchedule.findMany({ where: { userId: user.id, cropCycleId: cycle.id, scheduledAt: { gt: dateAtUtcNoon(moistureMeasuredDate), lte: dateAtUtcNoon(calculationDate) }, status: "COMPLETED", completedAt: { not: null }, isCheckOnly: false, actualQuantityLiters: { not: null } }, select: { scheduledAt: true, actualQuantityLiters: true } }),
  ]) : [[], []];
  const areaSquareMetres = cycle.field.areaUnit.toLowerCase() === "hectare" ? Number(cycle.field.area) * 10_000 : cycle.field.areaUnit.toLowerCase() === "acre" ? Number(cycle.field.area) * 4046.856 : 0;
  const calculation = calculateSimpleIrrigation({
    crop: cycle.crop.name, state: cycle.field.farm.state, district: cycle.field.farm.district,
    area: Number(cycle.field.area), areaUnit: cycle.field.areaUnit, growthStage: parsed.data.growthStage,
    soil: parsed.data.soil, method: parsed.data.method,
    month: Number(calculationDate.slice(5, 7)), moisture: parsed.data.moisture, moistureMeasuredDate, calculationDate,
    rainfallEvents: rainRows.map(row => ({ date: row.rainfallDate.toISOString().slice(0, 10), moistureMeasuredDate: row.moistureMeasuredDate?.toISOString().slice(0, 10), grossMm: Number(row.grossRainfallMm), effectiveMm: row.effectiveRainfallMm === null ? null : Number(row.effectiveRainfallMm), source: row.source, recordedAt: row.recordedAt.toISOString() })),
    irrigationEvents: irrigationRows.map(row => ({ date: row.scheduledAt.toISOString().slice(0, 10), depthMm: Number(row.actualQuantityLiters ?? 0) / (areaSquareMetres || Number.POSITIVE_INFINITY) })),
    forecastRainfallMm, forecastRainfallDate, weatherRetrievedAt,
    weatherMode: parsed.data.weatherMode, liveEt0MmDay, liveWeatherDate,
  });
  const result = { ...calculation, manualRainfallScenarioMm: parsed.data.manualRainfallScenarioMm };
  if (!parsed.data.save) return NextResponse.json({ success: true, data: result });
  if (!result.available || result.nextIrrigationInDays === undefined) {
    return NextResponse.json({ success: false, error: "A soil-check reminder cannot be saved until the selected crop, ETo, soil measurements, and irrigation references are available.", data: result }, { status: 422 });
  }

  const plannedCheckDate = addCalendarDays(calculationDate, result.nextIrrigationInDays);
  const scheduledAt = dateAtUtcNoon(plannedCheckDate);
  const start = new Date(`${plannedCheckDate}T00:00:00.000Z`);
  const end = new Date(`${addCalendarDays(plannedCheckDate, 1)}T00:00:00.000Z`);
  const note = `Soil-check reminder only; this is not an automatic watering instruction. Based on measured root-zone depletion ${round(result.depletionMm!)} mm and adjusted allowable depletion ${round(result.allowableDepletionMm!)} mm. ${result.rainfallNote}`;
  try {
    const row = await db.$transaction(async tx => {
      const activeCycle = await tx.cropCycle.count({ where: { id: cycle.id, status: { in: ["PLANNED", "ACTIVE"] }, actualHarvestDate: null, field: { farm: { userId: user.id } } } });
      if (activeCycle === 0) return null;
      const existing = await tx.irrigationSchedule.findFirst({ where: { userId: user.id, cropCycleId: cycle.id, completedAt: null, scheduledAt: { gte: start, lt: end }, OR: [{ status: "PLANNED" }, { status: null }] }, select: { id: true } });
      if (existing) return { id: existing.id, duplicate: true };
      const created = await tx.irrigationSchedule.create({ data: {
        userId: user.id, cropCycleId: cycle.id, scheduledAt, status: "PLANNED", isCheckOnly: true,
        method: parsed.data.method, cropGrowthStage: parsed.data.growthStage,
        recommendationSource: parsed.data.weatherMode === "live" ? "LIVE_ETO_SOIL_CHECK" : "OFFLINE_REFERENCE_SOIL_CHECK", recommendationNotes: note,
        notes: `Soil: ${parsed.data.soil}; measured root depth: ${parsed.data.moisture?.rootZoneDepthM ?? "not recorded"} m.`,
      }, select: { id: true } });
      return { id: created.id, duplicate: false };
    }, { isolationLevel: "Serializable" });
    if (!row) return NextResponse.json({ success: false, error: "The crop cycle is no longer active." }, { status: 409 });
    return NextResponse.json({ success: true, id: row.id, duplicate: row.duplicate, scheduledAt: plannedCheckDate, data: result }, { status: row.duplicate ? 200 : 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return NextResponse.json({ success: false, error: "A concurrent soil-check reminder was saved; refresh irrigation history." }, { status: 409 });
    throw error;
  }
}

function round(value: number) { return Math.round(value).toLocaleString("en-IN"); }
