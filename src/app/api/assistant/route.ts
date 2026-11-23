import { Prisma } from "@prisma/client";
import { getLocale } from "next-intl/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assistantFieldHistory, boundedAssistantHistory, assistantConversationTitle } from "@/lib/assistant-chat";
import { isCropCycleFinished, indiaDateKey } from "@/lib/crop-cycle-status";
import { cropAdviceLabel } from "@/i18n/crop-advice";
import { cropAdviceStage } from "@/lib/crop-advice-stage";
import { loadOpenMeteoForecast } from "@/lib/open-meteo";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { assistantErrorResponse } from "@/lib/assistant-api-errors";
import { assistantForecastDays, assistantReplyLocale, chooseAssistantAnswer, forecastSource, hasReliableOfflineAnswer, offlineAssistantAnswer, resolveAssistantQuestion, safeOfflineAfterFailure, type AssistantFieldEvidence, type AssistantSource } from "@/lib/assistant-knowledge";
import { answerAssistantOnline, defaultAssistantGeminiModel } from "@/lib/assistant-gemini";

const id = z.string().trim().min(1).max(100);
const schema = z.union([z.object({
  question: z.string().trim().min(5).max(1200),
  cropCycleId: z.string().trim().min(1).max(100).nullable().optional(),
  conversationId: z.string().trim().min(1).max(100).optional(),
  requestId: z.string().uuid().optional(),
}).strict(), z.object({ conversationId: id, retryMessageId: id }).strict()]);

async function handleAssistantPost(request: Request) {
  const user = await getUser({ throwDatabaseErrors: true });
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const rate = checkRateLimit(`assistant:${user.id}`);
  if (!rate.allowed) return NextResponse.json({ error: "Too many assistant requests. Please wait a minute and try again." }, { status: 429 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a question between 5 and 1,200 characters." }, { status: 400 });
  const retryMessageId = "retryMessageId" in parsed.data ? parsed.data.retryMessageId : undefined;
  const submission = "question" in parsed.data ? parsed.data : undefined;
  let question = submission?.question ?? "";
  const requestId = submission?.requestId;
  let selectedCycleId = submission?.cropCycleId ?? null;
  let retrySequence: number | undefined;
  let previousCycleId: string | null = null;

  let conversationId = parsed.data.conversationId;
  if (conversationId) {
    const owned = await db.assistantConversation.findFirst({ where: { id: conversationId, userId: user.id }, select: { id: true, cropCycleId: true } });
    if (!owned) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    previousCycleId = owned.cropCycleId;
    if (submission?.cropCycleId === undefined) selectedCycleId = previousCycleId;
    if (retryMessageId) {
      const [answer, original] = await db.assistantMessage.findMany({
        where: { conversationId }, orderBy: { sequence: "desc" }, take: 2,
        select: { id: true, sequence: true, role: true, content: true, mode: true, advice: true },
      });
      if (answer?.id !== retryMessageId || answer.role !== "ASSISTANT" || answer.mode !== "offline" ||
          !answer.advice || typeof answer.advice !== "object" || !("onlineIssue" in answer.advice) ||
          typeof answer.advice.onlineIssue !== "string" || original?.role !== "USER") {
        return NextResponse.json({ error: "Only the latest unanswered online request can be retried." }, { status: 409 });
      }
      question = original.content;
      retrySequence = original.sequence;
    }
    if (requestId) {
      const duplicate = await db.assistantMessage.findFirst({ where: { conversationId, role: "USER", requestId }, select: { id: true, sequence: true } });
      if (duplicate) {
        const previous = await db.assistantMessage.findFirst({ where: { conversationId, role: "ASSISTANT", sequence: duplicate.sequence + 1 }, select: { id: true, content: true, mode: true, advice: true, sources: true } });
        if (previous) return NextResponse.json({ conversationId, messageId: previous.id, answer: previous.content, mode: previous.mode ?? "offline", advice: previous.advice ?? null, sources: previous.sources ?? [], duplicate: true });
        return NextResponse.json({ error: "This question is already being answered." }, { status: 409 });
      }
    }
  }

  const historyRows = conversationId ? (await db.assistantMessage.findMany({
    where: { conversationId, sequence: retrySequence === undefined ? undefined : { lt: retrySequence } }, orderBy: { sequence: "desc" }, take: 12,
    select: { role: true, content: true, advice: true },
  })).reverse() : [];
  const locale = assistantReplyLocale(question, await getLocale());
  const hasChangedField = Boolean(conversationId && previousCycleId !== selectedCycleId);
  const fieldHistory = assistantFieldHistory(historyRows, selectedCycleId, hasChangedField);
  const history = boundedAssistantHistory(fieldHistory);
  const named = resolveAssistantQuestion(question, fieldHistory).crop;
  const asksAboutOwnField = /\b(my (crop|field|farm)|meri fasal|mere khet)\b|मेरी फसल|मेरे खेत|मेरे खेत में/i.test(question);
  if (!selectedCycleId && (named || asksAboutOwnField) && !hasChangedField) {
    const active = await db.cropCycle.findMany({
      where: { status: "ACTIVE", actualHarvestDate: null, field: { farm: { userId: user.id } } },
      select: { id: true, crop: { select: { name: true } } },
    });
    const matching = named ? active.filter(item => resolveAssistantQuestion("", [], item.crop.name).crop === named) : active;
    if (matching.length === 1) selectedCycleId = matching[0].id;
  }

  const crop = selectedCycleId ? await db.cropCycle.findFirst({
    where: { id: selectedCycleId, field: { farm: { userId: user.id } } },
    select: {
      id: true, cropId: true, cropVariety: true, status: true, season: true, sowingDate: true, expectedHarvestDate: true, actualHarvestDate: true,
      growthStage: true, growthStageUpdatedAt: true, cropDurationDays: true,
      crop: { select: { name: true, climateRequirement: { select: { cropDurationDays: true } } } },
      productions: { orderBy: { harvestDate: "desc" }, take: 1, select: { harvestDate: true, quantity: true, unit: true } },
      cropCalendar: { select: { estimatedHarvestDate: true, activities: {
        where: { status: "PENDING", scheduledDate: { gte: new Date(`${indiaDateKey(new Date())}T00:00:00Z`) } },
        orderBy: { scheduledDate: "asc" }, take: 8,
        select: { activityName: true, activityType: true, scheduledDate: true, growthStage: true },
      } } },
      field: { select: { id: true, name: true, area: true, areaUnit: true, soilType: true, soilTexture: true, soilPh: true, irrigationMethod: true, waterAvailability: true,
        farm: { select: { name: true, state: true, district: true, latitude: true, longitude: true } } } },
      schedules: { where: { userId: user.id }, orderBy: { scheduledAt: "desc" }, take: 4, select: { scheduledAt: true, completedAt: true, status: true, actualQuantityLiters: true, soilMoisturePercent: true, soilMoistureSource: true } },
      fertilizerApplications: { orderBy: { scheduledDate: "desc" }, take: 4, select: { product: true, quantityKg: true, scheduledDate: true, appliedDate: true, status: true } },
      fertilizerPlans: { orderBy: { createdAt: "desc" }, take: 1, select: { reference: { select: { metadata: true } } } },
    },
  }) : null;
  if (selectedCycleId && !crop) return NextResponse.json({ error: "Crop cycle not found." }, { status: 404 });

  const resolved = resolveAssistantQuestion(question, fieldHistory, crop?.crop.name);
  const wants = (intent: typeof resolved.intents[number]) => resolved.intents.includes(intent);
  const field: AssistantFieldEvidence = {};
  let cropContext: Record<string, unknown> | null = null;
  const sources: AssistantSource[] = [];
  if (crop && resolved.fieldMatches) {
    field.hasField = true;
    const today = indiaDateKey(new Date());
    const stage = cropAdviceStage({ crop: crop.crop.name, variety: crop.cropVariety, status: crop.status, sowingDate: crop.sowingDate,
      expectedHarvestDate: crop.expectedHarvestDate, actualHarvestDate: crop.actualHarvestDate,
      growthStage: crop.growthStage, growthStageUpdatedAt: crop.growthStageUpdatedAt,
      cropDurationDays: crop.cropDurationDays, climateDurationDays: crop.crop.climateRequirement?.cropDurationDays ?? null }, today);
    const reportedStage = resolved.stage;
    resolved.stage ??= stage.stage?.toLowerCase();
    field.stageEstimated = !reportedStage && stage.basis === "CALENDAR_ESTIMATE";
    const report = wants("nutrition") ? await db.fertilizerRecommendationHistory.findFirst({
      where: { userId: user.id, fieldId: crop.field.id, OR: [{ cropCycleId: selectedCycleId }, { cropCycleId: null, OR: [{ cropId: null }, { cropId: crop.cropId }] }] }, orderBy: [{ sampleDate: "desc" }, { createdAt: "desc" }],
      select: { sampleDate: true, result: true },
    }) : null;
    const reportResult = report?.result as { nutrients?: Array<{ name?: string; value?: number | null; unit?: string; rating?: string; sourceUrl?: string | null }> } | null;
    const nutrients = (reportResult?.nutrients ?? []).map(item => ({ name: item.name, value: item.value, unit: item.unit, status: item.rating }));
    const reportSources = (reportResult?.nutrients ?? []).flatMap(item => item.sourceUrl ? [{ label: item.name || "Soil report reference", url: item.sourceUrl }] : []);
    sources.push(...reportSources);
    const farm = crop.field.farm;
    const weather = (wants("weather") || wants("irrigation")) && farm.latitude !== null && farm.longitude !== null
      ? await loadOpenMeteoForecast(Number(farm.latitude), Number(farm.longitude)).catch(() => null) : null;
    field.forecast = assistantForecastDays(weather, today, question);
    if (field.forecast.length) sources.push(forecastSource);
    const planMetadata = crop.fertilizerPlans[0]?.reference.metadata as { title?: string; url?: string } | undefined;
    if (wants("nutrition") && planMetadata?.url) sources.push({ label: planMetadata.title || "Saved fertilizer recommendation", url: planMetadata.url });
    if ((wants("stage") || wants("irrigation")) && stage.sourceUrl && field.stageEstimated) sources.push({ label: stage.source || "Crop growth calendar", url: stage.sourceUrl });
    if (wants("irrigation") || wants("weather")) {
      const scoped = { userId: user.id, cropCycleId: crop.id };
      const now = new Date();
      const [irrigation, rain] = await Promise.all([
        db.irrigationSchedule.findFirst({
          where: { ...scoped, completedAt: { lte: now }, soilMoistureSource: "MEASURED", soilMoisturePercent: { not: null } },
          orderBy: { completedAt: "desc" }, select: { completedAt: true, soilMoisturePercent: true },
        }),
        db.rainfallObservation.findFirst({
          where: { ...scoped, source: { in: ["MANUAL_OBSERVATION", "WEATHER_STATION"] }, moistureMeasuredDate: { lte: now }, soilCurrentMoisturePercent: { not: null } },
          orderBy: { moistureMeasuredDate: "desc" }, select: { moistureMeasuredDate: true, soilCurrentMoisturePercent: true },
        }),
      ]);
      const reading = [
        { at: irrigation?.completedAt, percent: irrigation?.soilMoisturePercent?.toNumber() },
        { at: rain?.moistureMeasuredDate, percent: rain?.soilCurrentMoisturePercent?.toNumber() },
      ].sort((left, right) => (right.at?.getTime() ?? 0) - (left.at?.getTime() ?? 0))
        .find(item => item.at && item.percent !== undefined && item.percent >= 0 && item.percent <= 100);
      if (reading?.at && reading.percent !== undefined) field.moisture = { date: indiaDateKey(reading.at), percent: reading.percent };
    }
    field.expectedHarvestDate = crop.expectedHarvestDate ? indiaDateKey(crop.expectedHarvestDate) : null;
    field.calendarHarvestDate = crop.cropCalendar?.estimatedHarvestDate ? indiaDateKey(crop.cropCalendar.estimatedHarvestDate) : null;
    field.soilReportDate = report?.sampleDate ? indiaDateKey(report.sampleDate) : null;
    const pendingFertilizer = crop.fertilizerApplications.find(item => !item.appliedDate && indiaDateKey(item.scheduledDate) >= today && item.status !== "CANCELLED");
    if (pendingFertilizer) field.fertilizer = { product: pendingFertilizer.product, date: indiaDateKey(pendingFertilizer.scheduledDate) };
    field.actualHarvestDate = crop.actualHarvestDate ? indiaDateKey(crop.actualHarvestDate) : null;
    const production = crop.productions[0];
    if (production) field.latestHarvest = { date: indiaDateKey(production.harvestDate), quantity: production.quantity.toString(), unit: production.unit };
    if (wants("market") && resolved.wantsExpenses) {
      const expense = await db.expense.aggregate({ where: { userId: user.id, cropCycleId: crop.id }, _sum: { amount: true } });
      field.expenseTotal = expense._sum.amount?.toFixed(2);
    }
    if (wants("market") && resolved.wantsPrice) {
      const quote = await db.marketQuote.findFirst({
        where: { userId: user.id, crop: crop.crop.name },
        orderBy: { quoteDate: "desc" }, select: { quoteDate: true, mandi: true, price: true, unit: true },
      });
      if (quote) field.marketQuote = { date: indiaDateKey(quote.quoteDate), mandi: quote.mandi, price: quote.price.toFixed(2), unit: quote.unit };
    }
    cropContext = {
      crop: cropAdviceLabel(crop.crop.name, locale), variety: crop.cropVariety, season: crop.season,
      farmerReportedStage: reportedStage, growthStage: stage.stage, stageBasis: stage.basis, daysAfterSowing: stage.ageDays,
      sowingDate: crop.sowingDate ? indiaDateKey(crop.sowingDate) : null,
      expectedHarvestDate: crop.expectedHarvestDate ? indiaDateKey(crop.expectedHarvestDate) : null,
      actualHarvestDate: crop.actualHarvestDate ? indiaDateKey(crop.actualHarvestDate) : null,
      cycleStatus: isCropCycleFinished(crop) ? "HARVESTED" : crop.status,
      location: { state: farm.state, district: farm.district, season: crop.season },
      farm: { name: farm.name },
      field: { name: crop.field.name, area: crop.field.area.toNumber(), areaUnit: crop.field.areaUnit },
      soil: { type: crop.field.soilType, texture: crop.field.soilTexture, pH: crop.field.soilPh?.toNumber() ?? null, reportedNutrients: nutrients, reportDate: report?.sampleDate ? indiaDateKey(report.sampleDate) : null },
      irrigation: { method: crop.field.irrigationMethod, waterAvailability: crop.field.waterAvailability, records: crop.schedules.map(item => ({ scheduledDate: indiaDateKey(item.scheduledAt), completedDate: item.completedAt ? indiaDateKey(item.completedAt) : null, status: item.status, actualQuantityLiters: item.actualQuantityLiters?.toNumber() ?? null, soilMoisturePercent: item.soilMoistureSource === "MEASURED" && item.completedAt ? item.soilMoisturePercent?.toNumber() ?? null : null })) },
      fertilizerRecords: crop.fertilizerApplications.map(item => ({ product: item.product, quantityKg: item.quantityKg.toNumber(), plannedDate: indiaDateKey(item.scheduledDate), appliedDate: item.appliedDate ? indiaDateKey(item.appliedDate) : null, status: item.status })),
      forecast: field.forecast ?? [],
      latestSavedMoisture: field.moisture,
      expenseTotalInr: field.expenseTotal,
      savedMarketQuote: field.marketQuote,
      calendar: crop.cropCalendar && { ...crop.cropCalendar, activities: crop.cropCalendar.activities.map((activity) => ({ ...activity, scheduledDate: indiaDateKey(activity.scheduledDate) })) },
      latestHarvest: field.latestHarvest,

    };
  }

  const fallback = offlineAssistantAnswer(resolved, field, locale);
  const references = [...new Map([...fallback.sources, ...sources].map(source => [source.url, source])).values()];
  const reliable = hasReliableOfflineAnswer(question, resolved, field);
  const online = await chooseAssistantAnswer(reliable, Boolean(retryMessageId), () => answerAssistantOnline({
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    model: process.env.GEMINI_ASSISTANT_MODEL?.trim() || defaultAssistantGeminiModel,
    locale, question, history, field: cropContext, resolved, guidance: fallback.answer, sources: references,
  }));
  const onlineIssue = online?.onlineIssue;
  const offline = onlineIssue ? safeOfflineAfterFailure(question, resolved, field, locale, historyRows) : fallback;
  const answer = online?.answer ?? offline.answer;
  const advice = online?.advice ?? (onlineIssue ? { onlineIssue } : null);
  const mode = online?.answer ? "online" : "offline";
  const uniqueSources = online?.sources ?? offline.sources;
  const storedAnswer = { content: answer, mode, advice: advice ? advice as unknown as Prisma.InputJsonValue : Prisma.JsonNull, sources: uniqueSources as Prisma.InputJsonValue };
  if (!conversationId) {
    const conversation = await db.assistantConversation.create({
      data: { userId: user.id, cropCycleId: selectedCycleId, title: assistantConversationTitle(question) },
    });
    conversationId = conversation.id;
  }
  let messageId: string;
  try {
    messageId = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM AssistantConversation WHERE id = ${conversationId!} AND userId = ${user.id} FOR UPDATE`;
      const latest = await tx.assistantMessage.findFirst({ where: { conversationId: conversationId! }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      if (retryMessageId) {
        if (latest?.sequence !== retrySequence! + 1) return "";
        const updated = await tx.assistantMessage.updateMany({
          where: { id: retryMessageId, conversationId, mode: "offline" }, data: storedAnswer,
        });
        return updated.count ? retryMessageId : "";
      }
      const nextSequence = (latest?.sequence ?? 0) + 1;
      await tx.assistantConversation.update({ where: { id: conversationId! }, data: {
        cropCycleId: selectedCycleId,
        ...(nextSequence === 1 ? { title: assistantConversationTitle(question) } : {}),
      } });
      await tx.assistantMessage.create({ data: { conversationId: conversationId!, sequence: nextSequence, role: "USER", content: question, advice: { cropCycleId: selectedCycleId }, requestId: requestId ?? null } });
      const saved = await tx.assistantMessage.create({
        data: { conversationId: conversationId!, sequence: nextSequence + 1, role: "ASSISTANT", ...storedAnswer },
        select: { id: true },
      });
      return saved.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "This question was already submitted. Refresh the chat and continue." }, { status: 409 });
    return assistantErrorResponse(error, "assistant.chat.save");
  }
  if (!messageId) return NextResponse.json({ error: "The chat changed. Open the latest message to continue." }, { status: 409 });
  return NextResponse.json({ conversationId, messageId, cropCycleId: selectedCycleId, answer, advice, mode, sources: uniqueSources, ...(onlineIssue ? { onlineIssue } : {}) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
    return await handleAssistantPost(request);
  } catch (error) {
    return assistantErrorResponse(error, "assistant.post");
  }
}
