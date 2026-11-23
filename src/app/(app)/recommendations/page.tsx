import { savedCropWaterDemand } from "@/lib/saved-crop-water-demand";
import { getLocale } from "next-intl/server";
import { cropAdviceText } from "@/i18n/crop-advice";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { dateOnlyInIndia, indiaDateKey, isCropCycleFinished } from "@/lib/crop-cycle-status";
import { cropAdviceExpectedHarvest, cropAdviceStage } from "@/lib/crop-advice-stage";
import { waterValues } from "@/lib/crop-water";
import CropAdvice from "./ui";
import { fieldAdvice, fieldRain, savedProtectionRisks } from "@/lib/field-advice";
import { loadOpenMeteoForecast } from "@/lib/open-meteo";
import { deficientSoilReadings, lossSoilPh, maizeEstablishmentGuidance, rainExposureAlerts } from "@/lib/crop-loss-prevention";
import type { SoilHealthInput } from "@/lib/soil-health";
import { preventionSoilContext } from "@/lib/crop-loss-soil-context";
import { protectionText } from "@/i18n/crop-protection";
import { fieldAdviceText } from "@/i18n/crop-advice/field";
import { savedCropSoilAdvice, uniqueWaterReferences } from "@/lib/saved-crop-soil-advice";
import { soilLocationsMatch } from "@/lib/soil-health-links";

export default async function Recommendations() {
  const user = await getUser();
  if (!user) return null;
  const locale = await getLocale();
  const now = new Date();
  const today = indiaDateKey(now);
  const todayAsDate = dateOnlyInIndia(now);
  const day = (date?: Date | null) => date ? indiaDateKey(date) : null;
  const cycles = await db.cropCycle.findMany({
    where: { field: { farm: { userId: user.id } } },
    include: {
      field: { include: { farm: true } },
      crop: { include: { climateRequirement: true, soilRequirements: true, cropSeasons: { include: { waterStages: true } }, locationSuitabilities: true } },
      schedules: { where: { userId: user.id, OR: [{ completedAt: null, status: "PLANNED" }, { completedAt: null, status: null }, { completedAt: { not: null } }] }, orderBy: { scheduledAt: "asc" }, take: 100, select: { scheduledAt: true, completedAt: true, status: true, isCheckOnly: true, recommendationSource: true } },
      productions: { orderBy: { harvestDate: "desc" }, take: 1, select: { harvestDate: true } },
      fertilizerApplications: { where: { status: { in: ["PLANNED", "APPLIED"] } }, orderBy: { scheduledDate: "asc" }, take: 100, select: { scheduledDate: true, appliedDate: true, status: true, product: true } },
      fertilizerPlans: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      protectionAssessments: { where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200, select: { createdAt: true, findings: true } },
      cropCalendar: { select: { userId: true, status: true, activities: {
        where: { status: { in: ["PENDING", "DELAYED", "COMPLETED"] } }, orderBy: { scheduledDate: "asc" },
        select: { scheduledDate: true, activityType: true, activityName: true, actualCompletionDate: true, status: true, source: true, sourceUrl: true, updatedAt: true },
      } } },
    },
    orderBy: { createdAt: "desc" },
  });
  const farms = [...new Map(cycles.map(cycle => [cycle.field.farm.id, cycle.field.farm])).values()];
  const cycleIds = cycles.map(cycle => cycle.id);
  const [soilReports, reminders, forecasts, completedWatering, appliedFertilizer] = await Promise.all([
    db.fertilizerRecommendationHistory.findMany({
      where: { userId: user.id, fieldId: { in: [...new Set(cycles.map(cycle => cycle.fieldId))] }, sampleDate: { lte: todayAsDate } },
      orderBy: [{ sampleDate: "desc" }, { createdAt: "desc" }],
      select: { id: true, input: true, result: true, sampleDate: true, createdAt: true, fieldId: true },
    }),
    db.alert.findMany({
      where: { userId: user.id, dedupeKey: { startsWith: "loss:" }, completedAt: null, dueOn: { not: null },
        OR: cycleIds.map(id => ({ dedupeKey: { startsWith: `loss:${id}:` } })) },
      orderBy: { dueOn: "asc" }, select: { dedupeKey: true, href: true, dueOn: true },
    }),
    Promise.all(farms.map(async farm => {
      if (farm.latitude === null || farm.longitude === null) return [farm.id, null] as const;
      const forecast = await loadOpenMeteoForecast(Number(farm.latitude), Number(farm.longitude)).catch(() => null);
      return [farm.id, forecast] as const;
    })),
    db.irrigationSchedule.groupBy({
      by: ["cropCycleId"], where: { userId: user.id, cropCycleId: { in: cycleIds }, isCheckOnly: false, completedAt: { lte: now } },
      _max: { completedAt: true },
    }),
    db.fertilizerApplication.groupBy({
      by: ["cropCycleId"], where: { cropCycleId: { in: cycleIds }, status: "APPLIED", appliedDate: { lte: now } },
      _max: { appliedDate: true },
    }),
  ]);
  const weatherByFarm = new Map(forecasts);
  const wateringByCycle = new Map(completedWatering.map(row => [row.cropCycleId, day(row._max.completedAt)]));
  const fertilizerByCycle = new Map(appliedFertilizer.map(row => [row.cropCycleId, day(row._max.appliedDate)]));
  const savedCrops = cycles.map(cycle => {
    const farm = cycle.field.farm;
    const stageInfo = cropAdviceStage({ crop: cycle.crop.name, variety: cycle.cropVariety, status: cycle.status,
      sowingDate: cycle.sowingDate, expectedHarvestDate: cycle.expectedHarvestDate, actualHarvestDate: cycle.actualHarvestDate,
      growthStage: cycle.growthStage, growthStageUpdatedAt: cycle.growthStageUpdatedAt,
      cropDurationDays: cycle.cropDurationDays, climateDurationDays: cycle.crop.climateRequirement?.cropDurationDays ?? null }, today);
    const harvest = cropAdviceExpectedHarvest({ crop: cycle.crop.name, variety: cycle.cropVariety, status: cycle.status,
      sowingDate: cycle.sowingDate, expectedHarvestDate: cycle.expectedHarvestDate, actualHarvestDate: cycle.actualHarvestDate,
      growthStage: cycle.growthStage, growthStageUpdatedAt: cycle.growthStageUpdatedAt,
      cropDurationDays: cycle.cropDurationDays, climateDurationDays: cycle.crop.climateRequirement?.cropDurationDays ?? null }, today);
    const lossHref = `/crop-loss?cycle=${encodeURIComponent(cycle.id)}`;
    const soil = preventionSoilContext(soilReports.filter(row => row.fieldId === cycle.fieldId), {
      fieldId: cycle.fieldId, cropId: cycle.cropId, cropCycleId: cycle.id, crop: cycle.crop.name,
    }, todayAsDate).selected;
    const labPh = soil ? lossSoilPh(soil.input as SoilHealthInput, soil.result)?.value ?? null : null;
    const lowNutrients = soil ? deficientSoilReadings(soil.input as SoilHealthInput, soil.result) : [];
    const stageGuidance = maizeEstablishmentGuidance(cycle.crop.name, stageInfo.stage);
    const protection = cycle.protectionAssessments[0];
    const protectionConcern = cycle.protectionAssessments.some(record => {
      const findings = record.findings as { pollutionStatus?: string } | null;
      return findings?.pollutionStatus === "Possible Pollution" || findings?.pollutionStatus === "High Priority for Testing";
    });
    const forecast = weatherByFarm.get(farm.id) ?? null;
    const finished = isCropCycleFinished(cycle);
    const sowing = day(cycle.sowingDate);
    const growing = cycle.status === "ACTIVE" && !finished && Boolean(sowing && sowing <= today);
    const demand = growing && stageInfo.stage ? savedCropWaterDemand({
      crop: cycle.crop.name, state: farm.state, district: farm.district, area: Number(cycle.field.area),
      areaUnit: cycle.field.areaUnit, growthStage: stageInfo.stage, soil: cycle.field.soilType,
      method: cycle.field.irrigationMethod,
    }, forecast, today) : null;
    const rain = fieldRain(forecast, today);
    const exposedRain = forecast && !forecast.demo ? rainExposureAlerts({
      stage: growing ? stageInfo.stage : null,
      harvested: finished, daily: forecast.daily, fetchedAt: now.toISOString(),
    }, today).sort((a, b) => a.code.localeCompare(b.code))[0] : null;
    const allCalendarActivities = cycle.cropCalendar?.userId === user.id ? cycle.cropCalendar.activities : [];
    const calendar = ["ACTIVE", "PLANNED"].includes(cycle.cropCalendar?.status ?? "") ? allCalendarActivities : [];
    const scheduledForAdvice = (value: Date | undefined) => { const valueDay = day(value); return valueDay && valueDay >= today ? valueDay : null; };
    const irrigation = scheduledForAdvice(cycle.schedules.find(item => (day(item.scheduledAt) ?? "") >= today)?.scheduledAt)
      ?? scheduledForAdvice(calendar.find(item => item.activityType === "IRRIGATION_REVIEW" && (day(item.scheduledDate) ?? "") >= today)?.scheduledDate);
    const fertilizer = scheduledForAdvice(cycle.fertilizerApplications.find(item => (day(item.scheduledDate) ?? "") >= today)?.scheduledDate)
      ?? scheduledForAdvice(calendar.find(item => item.activityType === "FERTILIZER" && (day(item.scheduledDate) ?? "") >= today)?.scheduledDate);
    const reminder = reminders.find(item => item.dedupeKey?.startsWith(`loss:${cycle.id}:`));
    const advice = fieldAdvice({
      crop: cycle.crop.name, status: cycle.status, today, stage: stageInfo.stage, harvest,
      harvested: finished, soilSample: day(soil?.sampleDate), hasCoordinates: farm.latitude !== null && farm.longitude !== null, rain,
      calendar: day(calendar.find(item => !["IRRIGATION_REVIEW", "FERTILIZER", "HARVEST"].includes(item.activityType))?.scheduledDate),
      irrigation, fertilizer, fertilizerRecord: day(cycle.fertilizerPlans[0]?.createdAt), protection: day(protection?.createdAt),
      protectionConcern,
      loss: day(reminder?.dueOn), exposedRainDate: exposedRain?.code.slice("rain-exposure:".length),
    });
    const taskRows = [
      ...allCalendarActivities.map(item => ({ topic: item.activityType === "IRRIGATION_REVIEW" || item.activityType === "IRRIGATION" ? "irrigation" : item.activityType === "FERTILIZER" ? "fertilizer" : item.activityType === "HARVEST" ? "harvest" : "calendar", title: item.activityName, date: day(item.scheduledDate), completedDate: day(item.actualCompletionDate), done: item.status === "COMPLETED" || Boolean(item.actualCompletionDate), source: item.source, sourceUrl: item.sourceUrl, updated: day(item.updatedAt) })),
      ...cycle.schedules.filter(item => !item.isCheckOnly).map(item => ({ topic: "irrigation", title: "Saved irrigation schedule", date: day(item.scheduledAt), completedDate: day(item.completedAt), done: Boolean(item.completedAt), source: item.recommendationSource || "Saved irrigation record", sourceUrl: null, updated: day(item.completedAt ?? item.scheduledAt) })),
      ...cycle.fertilizerApplications.map(item => ({ topic: "fertilizer", title: item.product, date: day(item.scheduledDate), completedDate: day(item.appliedDate), done: item.status === "APPLIED" || Boolean(item.appliedDate), source: "Saved fertilizer application record", sourceUrl: null, updated: day(item.appliedDate ?? item.scheduledDate) })),
    ];
    const dedupedTasks = [...new Map(taskRows.filter(item => item.date).map(item => [`${item.topic}:${item.done ? item.completedDate : item.date}`, item])).values()];
    const soilResult = soil?.result as { nutrients?: Array<{ name: string; value: number | null; unit: string; basis: string; rating: string; method: string; sourceUrl?: string | null }> } | undefined;
    const soilInput = soil?.input as SoilHealthInput | undefined;
    const npkStatus = (soilResult?.nutrients ?? []).map(row => ({ ...row, sampleDate: day(soil?.sampleDate) }));
    const microReadings = [
      ...(soilInput?.supplementalReadings ?? []).map(reading => ({ name: reading.analyte, value: reading.value, unit: reading.unit, date: soilInput?.sampleDate ?? day(soil?.sampleDate), interpretation: "Recorded measurement; no status inferred." })),
      ...(soilInput?.nutritionSamples ?? []).filter(sample => ["micro", "secondary"].includes(sample.group)).flatMap(sample => sample.measurements.map(reading => ({ name: reading.parameter, value: reading.value, unit: reading.unit, date: sample.sampleDate, interpretation: reading.referenceRange || "Recorded measurement; no verified crop-specific range supplied." }))),
    ];
    const weatherIndex = forecast && !forecast.demo ? forecast.daily.time.indexOf(today) : -1;
    const weatherInfo = forecast && !forecast.demo ? {
      currentAt: forecast.current.time, currentTemp: forecast.current.temperature_2m,
      currentHumidity: forecast.current.relative_humidity_2m, currentRain: forecast.current.precipitation,
      forecastDate: weatherIndex >= 0 ? forecast.daily.time[weatherIndex] : null,
      forecastLow: weatherIndex >= 0 ? forecast.daily.temperature_2m_min[weatherIndex] : null,
      forecastHigh: weatherIndex >= 0 ? forecast.daily.temperature_2m_max[weatherIndex] : null,
      forecastRain: weatherIndex >= 0 ? forecast.daily.precipitation_sum[weatherIndex] : null,
      rainChance: weatherIndex >= 0 ? forecast.daily.precipitation_probability_max[weatherIndex] : null,
      source: "Open-Meteo",
    } : null;
    return {
      id: cycle.id, name: cycle.crop.name, fieldId: cycle.fieldId,
      field: cycle.field.name, farm: cycle.field.farm.name, farmId: farm.id,
      state: cycle.field.farm.state, district: cycle.field.farm.district,
      soil: cycle.field.soilType, availableWater: cycle.field.waterAvailability,
      area: `${cycle.field.area} ${cycle.field.areaUnit}`,
      season: cycle.season, status: cycle.status, stage: stageInfo.stage,
      sowing,
      harvest,
      harvestEstimated: !cycle.expectedHarvestDate,
      duration: stageInfo.durationDays,
      description: cycle.crop.description, descriptionSource: cycle.crop.source, illustrative: cycle.crop.illustrative,
      soilAdvice: savedCropSoilAdvice({ crop: cycle.crop.name, soil: cycle.field.soilType, state: cycle.field.farm.state, district: cycle.field.farm.district, ph: labPh ?? cycle.field.soilPh?.toNumber() ?? null, texture: cycle.field.soilTexture }, locale),
      advice, rain, protectionConcern, stageSource: stageGuidance?.url, hasLowNutrients: lowNutrients.length > 0,
      ageDays: stageInfo.ageDays, stageBasis: stageInfo.basis, stageConfirmedAt: stageInfo.confirmedAt,
      stageReference: stageInfo.source, stageReferenceUrl: stageInfo.sourceUrl, stageScope: stageInfo.scope,
      overdueHarvest: Boolean(harvest && harvest < today && !finished && !cycle.actualHarvestDate && !cycle.productions[0]),
      scheduledTasks: dedupedTasks,
      npkStatus, microReadings,
      weatherInfo,
      locationSuitability: cycle.crop.locationSuitabilities
        .filter(item => item.season === cycle.season && soilLocationsMatch({ state: item.state, district: item.district ?? farm.district }, { state: farm.state, district: farm.district }))
        .sort((a, b) => Number(Boolean(b.district)) - Number(Boolean(a.district)))
        .map(item => ({ notes: item.notes, source: item.source, url: item.sourceUrl, state: item.state, district: item.district, season: item.season }))[0] ?? null,
      risks: savedProtectionRisks(cycle.crop.name, protection?.findings).map(risk => ({ ...risk, name: protectionText(locale, risk.name) })),
      lastWatering: wateringByCycle.get(cycle.id) ?? null,
      lastFertilizer: fertilizerByCycle.get(cycle.id) ?? null,
      variety: cycle.cropVariety, growing, demand, actualHarvest: day(cycle.actualHarvestDate ?? cycle.productions[0]?.harvestDate),
      soilSample: day(soil?.sampleDate), protectionDate: day(protection?.createdAt),
      stageDate: day(cycle.growthStageUpdatedAt),
      lossHref: reminder?.href?.startsWith(lossHref + "&lot=") ? reminder.href : lossHref,
      soils: cycle.crop.soilTypes.split(",").map(value => value.trim()).filter(Boolean),
      seasons: cycle.crop.cropSeasons.length ? cycle.crop.cropSeasons.map(value => value.season) : cycle.crop.seasons.split(",").map(value => value.trim()).filter(Boolean),
      waterNeed: cycle.crop.waterNeed,
      water: uniqueWaterReferences(cycle.crop.cropSeasons.filter(value => value.season === cycle.season).flatMap(value => value.waterStages).flatMap(stage => waterValues([stage]).map(value => ({ ...value, method: stage.irrigationMethod, scope: stage.geographicScope })))),
      soilGuidance: cycle.crop.soilRequirements.map(value => ({ soil: value.soilType, notes: value.notes, fertilizer: value.fertilizerRecommendation, minPh: value.minPh?.toNumber() ?? null, maxPh: value.maxPh?.toNumber() ?? null, source: value.source, url: value.sourceUrl })),
    };
  });
  return <section className="crop-advice recommendations-page">
    <header className="crop-advice-heading">
      <h1>{cropAdviceText("Advice for your field crops", locale)}</h1>
      <p>{fieldAdviceText(locale, "intro")}</p>
    </header>
    <CropAdvice crops={savedCrops} today={today} />
  </section>;
}
