"use client";

import Link from "next/link";
import { ArrowRight, Wheat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cropAdviceLabel } from "@/i18n/crop-advice";
import { useHarvestData } from "../harvest-refresh";

export default function HarvestTracker() {
  const t = useTranslations("Dashboard");
  const common = useTranslations("Common");
  const locale = useLocale();
  const { crops, state, refresh } = useHarvestData();
  const active = crops
    ?.filter((crop) => crop.status !== "HARVESTED")
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  });
  const date = (value: string | null) =>
    value
      ? dateFormat.format(new Date(`${value}T00:00:00Z`))
      : t("notRecorded");

  return (
    <section
      className="panel harvest-tracker"
      aria-labelledby="harvest-tracker-title"
    >
      <div className="harvest-tracker-heading">
        <h2 id="harvest-tracker-title">{t("harvestTracker")}</h2>
        {state === "live" && (
          <span className="harvest-live-pill">
            <i aria-hidden="true" />
            {t("liveTracking")}
          </span>
        )}
      </div>
      {state === "loading" && <p role="status">{common("loading")}</p>}
      {state === "offline" && <p role="status">{t("trackerOffline")}</p>}
      {state === "error" && (
        <div className="harvest-tracker-actions">
          <p role="alert">{t("trackerError")}</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void refresh()}
          >
            {t("trackerRetry")}
          </button>
        </div>
      )}
      {state === "live" && !active?.length && (
        <div className="harvest-tracker-empty">
          <p>{t("trackerEmpty")}</p>
          <Link href="/crops#add-crop" className="btn">
            {t("addCrop")}
          </Link>
        </div>
      )}
      {!!active?.length && (
        <div className="harvest-tracker-grid">
          {active.map((crop) => {
            const status =
              crop.status === "READY"
                ? t("readySoon")
                : crop.status === "DUE_TODAY"
                  ? t("dueToday")
                  : crop.status === "OVERDUE"
                    ? t("overdue")
                    : crop.status === "UPCOMING"
                      ? t("upcoming")
                      : t("dateNeeded");
            const countdown =
              crop.days === null || crop.days === 0
                ? null
                : crop.days < 0
                  ? t("daysOverdue", { count: -crop.days })
                  : crop.days === 1
                    ? t("oneDayRemaining")
                    : t("daysRemaining", { count: crop.days });
            return (
              <article className="harvest-tracker-card" key={crop.id}>
                <div className="harvest-tracker-card-heading">
                  <Wheat aria-hidden="true" />
                  <h3>{cropAdviceLabel(crop.crop, locale)}</h3>
                  <span
                    className={`harvest-status-pill ${crop.status?.toLowerCase() ?? ""}`}
                  >
                    {status}
                  </span>
                </div>
                <p className="muted">
                  {crop.farm} · {crop.field}
                </p>
                <dl>
                  <div>
                    <dt>{t("sowing")}</dt>
                    <dd>{date(crop.sowingDate)}</dd>
                  </div>
                  <div>
                    <dt>{t("growingStage")}</dt>
                    <dd>
                      {crop.growthStage
                        ? cropAdviceLabel(crop.growthStage, locale)
                        : t("notRecorded")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("expectedHarvest")}</dt>
                    <dd>{date(crop.date)}</dd>
                  </div>
                  {countdown && (
                    <div>
                      <dt>
                        {t((crop.days ?? 0) < 0 ? "overdue" : "timeRemaining")}
                      </dt>
                      <dd>{countdown}</dd>
                    </div>
                  )}
                </dl>
                {crop.progress !== null && (
                  <div className="harvest-tracker-duration">
                    <span>
                      {t("durationElapsed", { count: crop.progress })}
                    </span>
                    <progress
                      aria-label={t("cropDurationProgress")}
                      max={100}
                      value={crop.progress}
                    />
                  </div>
                )}
                <div className="harvest-tracker-actions">
                  <Link
                    className="harvest-tracker-link"
                    href={
                      crop.date
                        ? crop.href
                        : `/crops?edit=${encodeURIComponent(crop.id)}#cycle-${encodeURIComponent(crop.id)}`
                    }
                  >
                    {crop.date ? t("viewCrop") : t("trackerEdit")}
                  </Link>
                  <Link
                    className="btn"
                    href={`/harvests?cropCycleId=${encodeURIComponent(crop.id)}#harvest-${encodeURIComponent(crop.id)}`}
                  >
                    {t("markHarvested")}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div>
        <Link href="/harvests" className="harvest-tracker-link">
          {t("openHarvestCenter")} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
