"use client";

import { useEffect, useState } from "react";

type Labels = { timeRemaining: string; daysRemaining: string; oneDayRemaining: string; dueToday: string; overdue: string; ready: string; upcoming: string; daysOverdue: string; cropDurationProgress: string; durationElapsed: string; durationRemaining: string; growingStage: string; nextHarvest: string; countdownUpdatesDaily: string };

function indiaTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function withCount(template: string, count: number, locale: string) {
  const formatter = new Intl.NumberFormat(locale);
  return template.replace(formatter.format(0), formatter.format(count));
}

export default function HarvestTrackerProgress({ sowingDate, harvestDate, labels, locale }: { sowingDate: string | null; harvestDate: string; labels: Labels; locale: string }) {
  const [today, setToday] = useState(indiaTodayKey);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(indiaTodayKey()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const toDay = (key: string) => Date.parse(`${key}T00:00:00Z`);
  const days = Math.ceil((toDay(harvestDate) - toDay(today)) / 86_400_000);
  const total = sowingDate ? toDay(harvestDate) - toDay(sowingDate) : 0;
  const elapsed = sowingDate && total > 0 ? Math.max(0, Math.min(100, Math.round(((toDay(today) - toDay(sowingDate)) / total) * 100))) : 0;
  const status = days < 0 ? "overdue" : days === 0 ? "dueToday" : days <= 7 ? "ready" : "upcoming";
  const statusClass = status === "dueToday" ? "due_today" : status;
  const countdown = days < 0 ? withCount(labels.daysOverdue, Math.abs(days), locale) : days === 0 ? labels.dueToday : days === 1 ? labels.oneDayRemaining : withCount(labels.daysRemaining, days, locale);
  return <>
    <div className="harvest-tracker-progress">
      <span className="harvest-tracker-label">{labels.timeRemaining}</span>
      <strong className={days < 0 ? "is-overdue" : ""}>{countdown}</strong>
      <div className="harvest-progress-track" role="progressbar" aria-label={labels.cropDurationProgress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={elapsed}><span style={{ width: `${elapsed}%` }} /></div>
      <div className="harvest-progress-labels"><span>{withCount(labels.durationElapsed, elapsed, locale)}</span><span>{withCount(labels.durationRemaining, 100 - elapsed, locale)}</span></div>
      <span className="harvest-stage-pill">{labels.growingStage}</span>
    </div>
    <div className="harvest-tracker-footer"><div><h3>{labels.nextHarvest}</h3><p>{labels.countdownUpdatesDaily}</p></div><span className={`harvest-next-status ${statusClass}`}>{labels[status]}</span></div>
  </>;
}
