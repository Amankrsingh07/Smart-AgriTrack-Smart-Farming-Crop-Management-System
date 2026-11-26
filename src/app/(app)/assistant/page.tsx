import AssistantForm from "./ui";
import { getLocale, getTranslations } from "next-intl/server";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { cropAdviceLabel } from "@/i18n/crop-advice";

export default async function Assistant({
  searchParams,
}: {
  searchParams: Promise<{ question?: string; cycle?: string }>;
}) {
  const { question, cycle } = await searchParams;
  const user = await getUser();
  if (!user) return null;
  const locale = await getLocale();
  const cycles = await db.cropCycle.findMany({
    where: { field: { farm: { userId: user.id } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      season: true,
      sowingDate: true,
      crop: { select: { name: true } },
      field: { select: { name: true, farm: { select: { name: true } } } },
    },
  });
  const ownedCycle =
    cycle && cycles.some((item) => item.id === cycle) ? cycle : "";
  const t = await getTranslations("Assistant");
  return (
    <>
      <p className="muted">{t("subtitle")}</p>
      <h1 style={{ marginTop: 0 }}>{t("title")}</h1>
      <p className="muted" style={{ maxWidth: 750 }}>
        {t("description")}
      </p>
      <AssistantForm
        initialQuestion={
          typeof question === "string" ? question.slice(0, 1200) : ""
        }
        cycle={ownedCycle}
        cycles={cycles.map((item) => ({
          id: item.id,
          crop: cropAdviceLabel(item.crop.name, locale),
          farm: item.field.farm.name,
          field: item.field.name,
          season: item.season,
          status: item.status,
          sowingDate: item.sowingDate?.toISOString().slice(0, 10) ?? null,
        }))}
      />
    </>
  );
}
