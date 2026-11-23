import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import soilHealthReference from "@/data/soil-health-reference.json";
import SoilHealthForm, { type SavedCheck } from "./ui";
import FertilizerBlendCalculator from "./blend-calculator";
import { cropAdviceStage } from "@/lib/crop-advice-stage";
import { indiaDateKey } from "@/lib/crop-cycle-status";

export default async function FertilizerRecommendationPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const user = await getUser();
  if (!user) return null;
  const t = await getTranslations("Fertilizer");
  const crops = await db.crop.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  const query = await searchParams;
  const cycles = await db.cropCycle.findMany({
    where: { field: { farm: { userId: user.id } }, actualHarvestDate: null, status: { in: ["PLANNED", "ACTIVE"] } },
    include: { crop: { include: { climateRequirement: { select: { cropDurationDays: true } } } }, field: { include: { farm: { select: { name: true, state: true, district: true } } } } },
    orderBy: [{ sowingDate: "desc" }, { createdAt: "desc" }], take: 100,
  });
  let history: Array<{ id: string; input: Prisma.JsonValue; result: Prisma.JsonValue; createdAt: Date }> = [];
  try {
    history = await db.fertilizerRecommendationHistory.findMany({ where: { userId: user.id }, select: { id: true, input: true, result: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 8 });
  } catch { /* The form remains usable if the optional history migration has not been applied. */ }
  const applications = await db.fertilizerApplication.findMany({
    where: { cropCycle: { field: { farm: { userId: user.id } } } },
    include: { cropCycle: { include: { crop: { select: { name: true } }, field: { select: { name: true } } } } },
    orderBy: [{ appliedDate: "desc" }, { scheduledDate: "desc" }], take: 100,
  });
  const cropNames = [...new Set([...(crops.length ? crops.map(crop => crop.name) : ["Rice (Paddy)", "Wheat", "Maize", "Mustard", "Chickpea (Gram)" ]), soilHealthReference.demoInput.crop])].sort((a, b) => a.localeCompare(b));
  return <main className="soil-health-page">
    <header className="plan-heading"><div><h1 style={{ margin: 0 }}>{t("title")}</h1></div></header>
    <SoilHealthForm initialCycleId={cycles.some(cycle => cycle.id === query.cycle) ? query.cycle : ""} cropNames={cropNames} cycles={cycles.map(cycle => ({ id: cycle.id, crop: cycle.crop.name, cropId: cycle.cropId, variety: cycle.cropVariety, season: cycle.season, stage: cropAdviceStage({ crop: cycle.crop.name, variety: cycle.cropVariety, status: cycle.status, sowingDate: cycle.sowingDate, expectedHarvestDate: cycle.expectedHarvestDate, actualHarvestDate: cycle.actualHarvestDate, growthStage: cycle.growthStage, growthStageUpdatedAt: cycle.growthStageUpdatedAt, cropDurationDays: cycle.cropDurationDays, climateDurationDays: cycle.crop.climateRequirement?.cropDurationDays ?? null }, indiaDateKey(new Date())).stage ?? "", sowingDate: cycle.sowingDate?.toISOString().slice(0, 10) ?? "", field: cycle.field.name, fieldId: cycle.fieldId, farm: cycle.field.farm.name, farmId: cycle.field.farmId, state: cycle.field.farm.state, district: cycle.field.farm.district, soilType: cycle.field.soilType, area: Number(cycle.field.area), areaUnit: cycle.field.areaUnit === "acre" ? "acre" : "hectare" }))} applications={applications.map(item => ({ id: item.id, crop: item.cropCycle.crop.name, field: item.cropCycle.field.name, product: item.product, quantityKg: Number(item.quantityKg), status: item.status, scheduledDate: item.scheduledDate.toISOString().slice(0, 10), appliedDate: item.appliedDate?.toISOString().slice(0, 10) ?? null, method: item.method, cost: item.cost === null ? null : Number(item.cost) }))} initialHistory={history.map(item => ({ id: item.id, input: item.input, result: item.result, createdAt: item.createdAt.toISOString() })) as unknown as SavedCheck[]}/>
    <details className="panel farmer-fertilizer-advanced"><summary>{t("productPlan")}</summary><FertilizerBlendCalculator /></details>
  </main>;
}
