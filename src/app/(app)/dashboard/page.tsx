import type { Prisma } from "@prisma/client";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Droplets,
  Map,
  Sprout,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import Analytics from "../analytics";
import { getLocale, getTranslations } from "next-intl/server";
import HarvestTracker from "./harvest-tracker";
import { dashboardFieldArea } from "@/lib/fertilizer-dashboard";
import { indiaDateKey } from "@/lib/crop-cycle-status";
import { expenseCost, netProfit, profitStatus } from "@/lib/finance";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default async function Dashboard() {
  const user = await getUser();
  if (!user) return null;
  const t = await getTranslations("Dashboard");
  const locale = await getLocale();
  const navigation = await getTranslations("Navigation");
  const records = await getTranslations("Records");
  const irrigation = await getTranslations("Irrigation");
  const today = new Date(indiaDateKey(new Date()));
  const activeCycles: Prisma.CropCycleWhereInput = {
    field: { farm: { userId: user.id } },
    actualHarvestDate: null,
    status: { in: ["PLANNED", "ACTIVE"] },
  };
  const pendingActivities = {
    calendar: { userId: user.id, cropCycle: activeCycles },
    status: { in: ["PENDING", "DELAYED"] },
  };
  const [
    farms,
    cycles,
    expenses,
    sales,
    todayCount,
    upcomingCount,
    irrigationCount,
  ] = await Promise.all([
    db.farm.findMany({
      where: { userId: user.id },
      include: {
        fields: {
          include: {
            cropCycles: {
              where: { status: "ACTIVE" },
              include: { crop: true },
              take: 1,
            },
          },
        },
      },
    }),
    db.cropCycle.count({
      where: { field: { farm: { userId: user.id } }, status: "ACTIVE" },
    }),
    db.expense.findMany({
      where: { userId: user.id },
      select: { amount: true },
    }),
    db.sale.aggregate({
      where: { cropCycle: { field: { farm: { userId: user.id } } } },
      _sum: { totalRevenue: true },
    }),
    db.cropCalendarActivity.count({
      where: { ...pendingActivities, scheduledDate: today },
    }),
    db.cropCalendarActivity.count({
      where: { ...pendingActivities, scheduledDate: { gt: today } },
    }),
    db.irrigationSchedule.count({
      where: {
        userId: user.id,
        cropCycle: activeCycles,
        isCheckOnly: true,
        status: "PLANNED",
        completedAt: null,
      },
    }),
  ]);
  const land = farms.reduce(
    (sum, farm) =>
      sum +
      farm.fields.reduce(
        (total, field) =>
          total + (dashboardFieldArea(Number(field.area), field.areaUnit) ?? 0),
        0,
      ),
    0,
  );
  const cost = expenses.reduce((sum, row) => sum + expenseCost(row.amount), 0),
    revenue = Number(sales._sum.totalRevenue || 0);
  const profit = netProfit(revenue, cost),
    status = profitStatus(profit);
  const firstName = user.name.trim().split(/\s+/)[0] || "there";
  const primaryFarm = farms[0];
  const farmLocation = primaryFarm
    ? [primaryFarm.village, primaryFarm.district, primaryFarm.state]
        .filter(Boolean)
        .join(", ")
    : "";
  return (
    <div className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">{t("overview")}</p>
          <h1>{t("greeting", { name: firstName })}</h1>
          <p>{farmLocation || t("farmActivity")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" href="/recommendations">
            {navigation("cropAdvice")}
          </Link>
          <Link className="btn" href="/fertilizer-recommendation">
            {navigation("fertilizer")}
          </Link>
          <Link className="btn" href="/farms">
            {t("addFarm")}
          </Link>
        </div>
      </header>
      <div className="dashboard-section-title">
        <div>
          <p className="eyebrow">{t("records")}</p>
          <h2>{t("summary")}</h2>
        </div>
        <span className="quiet-chip">
          {farms.length} {farms.length === 1 ? t("farm") : t("farms")} ·{" "}
          {cycles} {cycles === 1 ? t("activeCrop") : t("activeCrops")}
        </span>
      </div>
      <section className="cards dashboard-stats">
        <article className="panel stat dashboard-stat">
          <span className="stat-symbol">
            <Map size={25} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="muted">{t("land")}</span>
          <strong>
            {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
              land,
            )}{" "}
            <small>ha</small>
          </strong>
          <small className="stat-foot">{t("landTotal")}</small>
        </article>
        <article className="panel stat dashboard-stat">
          <span className="stat-symbol leaf-symbol">
            <Sprout size={25} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="muted">{t("cycles")}</span>
          <strong>{cycles}</strong>
          <small className="stat-foot">{t("growing")}</small>
        </article>
        <article className="panel stat dashboard-stat">
          <span className="stat-symbol cost-symbol">
            <Wallet size={25} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="muted">{t("expenses")}</span>
          <strong>{money.format(cost)}</strong>
          <small className="stat-foot">{t("costs")}</small>
        </article>
        <article className="panel stat dashboard-stat">
          <span className="stat-symbol income-symbol">
            <TrendingUp size={25} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="muted">{t("sales")}</span>
          <strong
            className={
              status === "loss"
                ? "negative-number"
                : status === "profit"
                  ? "positive-number"
                  : ""
            }
          >
            {money.format(profit)}
          </strong>
          <small className="stat-foot">
            {records("salesRevenue")} · {money.format(revenue)}
          </small>
        </article>
      </section>
      <section className="cards dashboard-stats" aria-label={t("schedule")}>
        <Link className="panel stat dashboard-stat" href="/crop-calendar">
          <span className="stat-symbol">
            <CalendarClock size={25} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span>{t("dueToday")}</span>
          <strong>{todayCount}</strong>
        </Link>
        <Link className="panel stat dashboard-stat" href="/crop-calendar">
          <span className="stat-symbol leaf-symbol">
            <CalendarDays size={25} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span>{t("upcoming")}</span>
          <strong>{upcomingCount}</strong>
        </Link>
        <Link
          className="panel stat dashboard-stat"
          href="/irrigation#irrigation-history"
        >
          <span className="stat-symbol income-symbol">
            <Droplets size={25} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span>{irrigation("plannedChecks")}</span>
          <strong>{irrigationCount}</strong>
        </Link>
      </section>
      <HarvestTracker key={user.id} />
      <section className="panel" style={{ margin: "20px 0" }}>
        <h2>Harvest outcomes</h2>
        <Link className="subtle-link" href="/crop-loss">
          Review harvest losses and prevention{" "}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
      <Analytics compact />
      <div className="dashboard-lower">
        <section className="panel farm-book-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{t("yourLand")}</p>
              <h2>{t("farmsFields")}</h2>
            </div>
            <Link href="/farms" className="subtle-link">
              {t("manage")} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {farms.length === 0 ? (
            <div className="empty-state">
              <strong>{t("noFarms")}</strong>
              <p className="muted">{t("addFields")}</p>
              <Link href="/farms" className="btn">
                {t("addFarm")}
              </Link>
            </div>
          ) : (
            <div className="farm-list">
              {farms.map((farm, index) => (
                <article className="farm-entry" key={farm.id}>
                  <span className="farm-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="farm-entry-main">
                    <strong>{farm.name}</strong>
                    <span>
                      {[farm.village, farm.district, farm.state]
                        .filter(Boolean)
                        .join(" · ") || t("locationMissing")}
                    </span>
                    <div className="field-chips">
                      {farm.fields.length ? (
                        farm.fields.map((field) => (
                          <span key={field.id}>
                            <i /> {field.name}
                            {field.cropCycles[0]
                              ? ` · ${field.cropCycles[0].crop.name}`
                              : ""}
                          </span>
                        ))
                      ) : (
                        <span>{t("noFields")}</span>
                      )}
                    </div>
                  </div>
                  <span className="farm-area">
                    {farm.fields
                      .reduce((sum, field) => sum + Number(field.area), 0)
                      .toFixed(1)}{" "}
                    <small>{farm.fields[0]?.areaUnit ?? "ac"}</small>
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
