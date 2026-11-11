import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import soilHealthReference from "@/data/soil-health-reference.json";
import SoilHealthForm, { type SavedCheck } from "./ui";

export default async function FertilizerRecommendationPage() {
  const user = await getUser();
  if (!user) return null;
  const t = await getTranslations("Fertilizer");
  const crops = await db.crop.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  let history: Array<{ id: string; input: Prisma.JsonValue; result: Prisma.JsonValue; createdAt: Date }> = [];
  try {
    history = await db.fertilizerRecommendationHistory.findMany({ where: { userId: user.id }, select: { id: true, input: true, result: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 8 });
  } catch { /* The form remains usable if the optional history migration has not been applied. */ }
  const cropNames = [...new Set([...(crops.length ? crops.map(crop => crop.name) : ["Rice (Paddy)", "Wheat", "Maize", "Mustard", "Chickpea (Gram)" ]), soilHealthReference.demoInput.crop])].sort((a, b) => a.localeCompare(b));
  return <main className="soil-health-page">
    <header className="plan-heading"><div><p className="muted" style={{ margin: "0 0 5px" }}>OFFLINE SOIL HEALTH CARD SCREENING</p><h1 style={{ margin: 0 }}>{t("title")}</h1><p className="muted">{t("subtitle")}</p></div></header>
    <SoilHealthForm cropNames={cropNames} initialHistory={history.map(item => ({ id: item.id, input: item.input, result: item.result, createdAt: item.createdAt.toISOString() })) as unknown as SavedCheck[]}/>
  </main>;
}
