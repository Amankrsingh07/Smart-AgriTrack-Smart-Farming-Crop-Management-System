"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

type HarvestItem = { id: string; crop: string; field: string; farm: string; date: string };
type Labels = { readySoon: string; upcoming: string; dueToday: string; overdue: string; daysRemaining: string; oneDayRemaining: string; daysOverdue: string; expected: string; markHarvested: string; viewCrop: string };

function todayInIndia() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export default function UpcomingHarvestList({ items, locale, labels }: { items: HarvestItem[]; locale: string; labels: Labels }) {
  const [today, setToday] = useState(todayInIndia);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayInIndia()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const number = new Intl.NumberFormat(locale);
  const replaceCount = (text: string, count: number) => text.replace(number.format(0), number.format(count));
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return <section className="dashboard-upcoming-harvests" aria-label={labels.upcoming}>
    {items.map((item) => {
      const days = Math.ceil((Date.parse(`${item.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      const status = days < 0 ? "overdue" : days === 0 ? "due_today" : days <= 7 ? "ready" : "upcoming";
      const statusLabel = days < 0 ? labels.overdue : days === 0 ? labels.dueToday : days <= 7 ? labels.readySoon : labels.upcoming;
      const countdown = days < 0 ? replaceCount(labels.daysOverdue, Math.abs(days)) : days === 0 ? labels.dueToday : days === 1 ? labels.oneDayRemaining : replaceCount(labels.daysRemaining, days);
      return <article className="dashboard-upcoming-card" key={item.id}>
        <div className="dashboard-upcoming-top"><h3>{item.crop}</h3><span className={`dashboard-upcoming-status ${status}`}>{statusLabel}</span></div>
        <p className="dashboard-upcoming-field">{item.farm} · {item.field}</p>
        <p className="dashboard-upcoming-date">{labels.expected}: {dateFormat.format(new Date(`${item.date}T00:00:00Z`))}</p>
        <strong className={`dashboard-upcoming-countdown${days < 0 ? " overdue" : ""}`}>{countdown}</strong>
        <div className="dashboard-upcoming-actions"><Link className="btn" href={`/harvests?cropCycleId=${encodeURIComponent(item.id)}`}>{labels.markHarvested}</Link><Link className="subtle-link" href={`/crops#cycle-${encodeURIComponent(item.id)}`}>{labels.viewCrop} <ArrowRight size={16} aria-hidden="true" /></Link></div>
      </article>;
    })}
  </section>;
}
