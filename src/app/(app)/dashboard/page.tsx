import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarDays, Droplets, Map, Sprout, TrendingUp, Wallet, Wheat } from "lucide-react";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import Analytics from "../analytics";
import { getLocale, getTranslations } from "next-intl/server";
import { expectedHarvestDate } from "@/lib/harvest";
import HarvestTrackerProgress from "./harvest-tracker-progress";
import UpcomingHarvestList from "./upcoming-harvest-list";
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
  const activeCycles: Prisma.CropCycleWhereInput = { field: { farm: { userId: user.id } }, actualHarvestDate: null, status: { in: ["PLANNED", "ACTIVE"] } };
  const pendingActivities = { calendar: { userId: user.id, cropCycle: activeCycles }, status: { in: ["PENDING", "DELAYED"] } };
  const [farms, cycles, expenses, sales, cropCycles, todayCount, upcomingCount, irrigationCount] =
    await Promise.all([
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
      db.cropCycle.findMany({
        where: { field: { farm: { userId: user.id } }, status: { in: ["PLANNED", "ACTIVE"] } },
        include: { crop: { include: { climateRequirement: true } }, field: { include: { farm: true } } },
        orderBy: [{ expectedHarvestDate: "asc" }, { sowingDate: "asc" }],
        take: 100,
      }),
      db.cropCalendarActivity.count({ where: { ...pendingActivities, scheduledDate: today } }),
      db.cropCalendarActivity.count({ where: { ...pendingActivities, scheduledDate: { gt: today } } }),
      db.irrigationSchedule.count({ where: { userId: user.id, cropCycle: activeCycles, isCheckOnly: true, status: "PLANNED", completedAt: null } }),
    ]);
  const land = farms.reduce(
    (sum, farm) =>
      sum + farm.fields.reduce((total, field) => total + (dashboardFieldArea(Number(field.area), field.areaUnit) ?? 0), 0),
    0,
  );
  const cost = expenses.reduce((sum, row) => sum + expenseCost(row.amount), 0),
    revenue = Number(sales._sum.totalRevenue || 0);
  const profit = netProfit(revenue, cost), status = profitStatus(profit);
  const firstName = user.name.trim().split(/\s+/)[0] || "there";
  const primaryFarm = farms[0];
  const farmLocation = primaryFarm
    ? [primaryFarm.village, primaryFarm.district, primaryFarm.state]
        .filter(Boolean)
        .join(", ")
    : "";
  const harvestEntries = cropCycles
    .map((cycle) => ({ cycle, date: expectedHarvestDate(cycle) }))
    .filter((entry): entry is { cycle: (typeof cropCycles)[number]; date: Date } => !!entry.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const nextHarvest = harvestEntries[0];
  const dateFormatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const dateKey = (date: Date) => date.toISOString().slice(0, 10);

  return (
    <div className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow">{t("overview")}</p>
          <h1>{t("greeting", { name: firstName })}</h1>
          <p>{farmLocation || t("farmActivity")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" href="/recommendations">{navigation("cropAdvice")}</Link>
          <Link className="btn" href="/fertilizer-recommendation">{navigation("fertilizer")}</Link>
          <Link className="btn" href="/farms">{t("addFarm")}</Link>
        </div>
      </header>
      <div className="dashboard-section-title">
        <div>
          <p className="eyebrow">{t("records")}</p>
          <h2>{t("summary")}</h2>
        </div>
        <span className="quiet-chip">
          {farms.length} {farms.length === 1 ? t("farm") : t("farms")} · {cycles}{" "}
          {cycles === 1 ? t("activeCrop") : t("activeCrops")}
        </span>
      </div>
      <section className="cards dashboard-stats">
        <article className="panel stat dashboard-stat">
          <span className="stat-symbol"><Map size={25} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="muted">{t("land")}</span>
          <strong>
            {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(land)} <small>ha</small>
          </strong>
          <small className="stat-foot">{t("landTotal")}</small>
        </article>
        <article className="panel stat dashboard-stat">
          <span className="stat-symbol leaf-symbol"><Sprout size={25} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="muted">{t("cycles")}</span>
          <strong>{cycles}</strong>
          <small className="stat-foot">{t("growing")}</small>
        </article>
        <article className="panel stat dashboard-stat">
          <span className="stat-symbol cost-symbol"><Wallet size={25} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="muted">{t("expenses")}</span>
          <strong>{money.format(cost)}</strong>
          <small className="stat-foot">{t("costs")}</small>
        </article>
        <article className="panel stat dashboard-stat">
          <span className="stat-symbol income-symbol"><TrendingUp size={25} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="muted">{t("sales")}</span>
          <strong className={status === "loss" ? "negative-number" : status === "profit" ? "positive-number" : ""}>
            {money.format(profit)}
          </strong>
          <small className="stat-foot">{records("salesRevenue")} · {money.format(revenue)}</small>
        </article>
      </section>
      <section className="cards dashboard-stats" aria-label={t("schedule")}>
        <Link className="panel stat dashboard-stat" href="/crop-calendar"><span className="stat-symbol"><CalendarClock size={25} strokeWidth={1.8} aria-hidden="true" /></span><span>{t("dueToday")}</span><strong>{todayCount}</strong></Link>
        <Link className="panel stat dashboard-stat" href="/crop-calendar"><span className="stat-symbol leaf-symbol"><CalendarDays size={25} strokeWidth={1.8} aria-hidden="true" /></span><span>{t("upcoming")}</span><strong>{upcomingCount}</strong></Link>
        <Link className="panel stat dashboard-stat" href="/irrigation#irrigation-history"><span className="stat-symbol income-symbol"><Droplets size={25} strokeWidth={1.8} aria-hidden="true" /></span><span>{irrigation("plannedChecks")}</span><strong>{irrigationCount}</strong></Link>
      </section>
      <section className="panel harvest-tracker">
        <div className="harvest-tracker-heading"><h2>{t("harvestTracker")}</h2><span className="harvest-live-pill"><i />{t("liveTracking")}</span></div>
        {nextHarvest ? <>
          <div className="harvest-tracker-crop">
            <div className="harvest-tracker-art" aria-hidden="true"><Wheat size={52} strokeWidth={1.5} /></div>
            <div className="harvest-tracker-crop-copy">
              <h3>{nextHarvest.cycle.crop.name} – {nextHarvest.cycle.field.name}</h3>
              <p>{t("sowing")}: {nextHarvest.cycle.sowingDate ? dateFormatter.format(new Date(`${dateKey(nextHarvest.cycle.sowingDate)}T00:00:00Z`)) : t("notRecorded")}</p>
              <p>{t("expectedHarvest")}: {dateFormatter.format(new Date(`${dateKey(nextHarvest.date)}T00:00:00Z`))}</p>
              <small>{nextHarvest.cycle.field.farm.name}</small>
            </div>
          </div>
          <HarvestTrackerProgress locale={locale} sowingDate={nextHarvest.cycle.sowingDate ? dateKey(nextHarvest.cycle.sowingDate) : null} harvestDate={dateKey(nextHarvest.date)} labels={{ timeRemaining:t("timeRemaining"), daysRemaining:t("daysRemaining", { count:0 }), oneDayRemaining:t("oneDayRemaining"), dueToday:t("dueToday"), overdue:t("overdue"), ready:t("ready"), upcoming:t("upcoming"), daysOverdue:t("daysOverdue", { count:0 }), cropDurationProgress:t("cropDurationProgress"), durationElapsed:t("durationElapsed", { count:0 }), durationRemaining:t("durationRemaining", { count:0 }), growingStage:t("growingStage"), nextHarvest:t("nextHarvest"), countdownUpdatesDaily:t("countdownUpdatesDaily") }} />
        </> : <div className="harvest-tracker-empty"><p>{t("noUpcomingHarvest")}</p><Link href="/crops" className="subtle-link">{t("addCropCycle")} <ArrowRight size={16} aria-hidden="true" /></Link></div>}
        <Link href="/harvests" className="harvest-tracker-link">{t("openHarvestCenter")} <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
      {harvestEntries.length > 1 && <UpcomingHarvestList locale={locale} items={harvestEntries.slice(1).map(({ cycle, date }) => ({ id: cycle.id, crop: cycle.crop.name, field: cycle.field.name, farm: cycle.field.farm.name, date: dateKey(date) }))} labels={{ readySoon:t("readySoon"), upcoming:t("upcoming"), dueToday:t("dueToday"), overdue:t("overdue"), daysRemaining:t("daysRemaining", { count:0 }), oneDayRemaining:t("oneDayRemaining"), daysOverdue:t("daysOverdue", { count:0 }), expected:t("expectedHarvest"), markHarvested:t("markHarvested"), viewCrop:t("viewCrop") }} />}
      <section className="panel" style={{margin:"20px 0"}}><h2>Harvest outcomes</h2><Link className="subtle-link" href="/crop-loss">Review harvest losses and prevention <ArrowRight size={16} aria-hidden="true" /></Link></section>
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
              <p className="muted">
                {t("addFields")}
              </p>
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
