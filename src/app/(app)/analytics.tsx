"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { displayLabel } from "@/i18n/display-labels";
import { netProfit, profitStatus } from "@/lib/finance";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Data = { summary: { expenses: number; revenue: number; production: number }; monthly: { key: string; month: string; expenses: number; revenue: number; profit: number }[]; categories: { name: string; value: number }[]; crops: { name: string; value: number }[] };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const palette = ["#286b45", "#74a95c", "#c7833e", "#5a8a9b", "#a6b85b", "#8666a6", "#d18b8b"];

export default function Analytics({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Records");
  const locale = useLocale();
  const [range, setRange] = useState("6m"), [from, setFrom] = useState(""), [to, setTo] = useState(""), [retry, setRetry] = useState(0);
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState("");
  useEffect(() => {
    if (range === "custom" && (!from || !to)) return;
    const controller = new AbortController();
    setData(null); setError("");
    const query = new URLSearchParams({ range });
    if (range === "custom") { query.set("from", from); query.set("to", to); }
    fetch(`/api/analytics?${query}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load analytics."); return result as Data;
    }).then(setData).catch(reason => { if (reason.name !== "AbortError") setError(reason.message || "Could not load analytics."); });
    return () => controller.abort();
  }, [range, from, to, retry]);

  return <section className={`analytics-section${compact ? " analytics-compact" : ""}`}>
    <div className="analytics-heading"><div><p className="eyebrow">{t("analyticsTitle")}</p><h2>{t("performanceOverview")}</h2><p className="muted">{t("analyticsHelp")}</p></div>
      <div className="analytics-filters"><label><span className="sr-only">{t("dateRange")}</span><select value={range} onChange={event => setRange(event.target.value)}><option value="month">{t("thisMonth")}</option><option value="6m">{t("last6Months")}</option><option value="year">{t("thisYear")}</option><option value="custom">{t("customRange")}</option></select></label>
        {range === "custom" && <><label><span className="sr-only">From date</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label><span className="sr-only">To date</span><input type="date" value={to} onChange={event => setTo(event.target.value)} /></label></>}
      </div>
    </div>
    {error ? <div role="alert" className="panel analytics-state analytics-error">{error} <button className="btn" onClick={() => setRetry(value => value + 1)}>{t("retry")}</button></div> : !data ? <div className="panel analytics-state" role="status">{range === "custom" && (!from || !to) ? t("customBoth") : t("analyticsLoading")}</div> : <>
      {(() => { const profit = netProfit(data.summary.revenue, data.summary.expenses); const status = profitStatus(profit); return <div className="cards analytics-stats"><Metric label={t("totalExpenses")} value={money(data.summary.expenses)} /><Metric label={t("totalRevenue")} value={money(data.summary.revenue)} /><Metric label={t("profitLoss")} value={`${status === "profit" ? "Profit" : status === "loss" ? "Loss" : "Break Even"} · ${money(profit)}`} negative={status === "loss"} positive={status === "profit"} /></div>; })()}
      <div className="analytics-grid">
        <ChartCard title={t("monthlyExpenses")}>{data.summary.expenses ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" /><YAxis tickFormatter={shortMoney} width={70} /><Tooltip formatter={(value) => money(Number(value))} /><Bar dataKey="expenses" name={t("expenses")} fill="#39764a" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer> : <Empty text={t("noRecordsForRange")} />}</ChartCard>
        <ChartCard title={t("expenseBreakdown")}>{data.categories.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.categories} dataKey="value" nameKey="name" cx="50%" cy="48%" outerRadius="72%" label={({ name, percent }) => `${displayLabel(String(name), locale)} ${(Number(percent) * 100).toFixed(0)}%`}>{data.categories.map((entry, index) => <Cell key={entry.name} fill={palette[index % palette.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value))} /><Legend /></PieChart></ResponsiveContainer> : <Empty text={t("noRecordsForRange")} />}</ChartCard>
        <ChartCard title={t("revenueVsExpenses")}>{data.summary.expenses || data.summary.revenue ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data.monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" /><YAxis tickFormatter={shortMoney} width={70} /><Tooltip formatter={(value) => money(Number(value))} /><Legend /><Line type="monotone" dataKey="revenue" name={t("revenue")} stroke="#c7833e" strokeWidth={3} dot={{ r: 3 }} /><Line type="monotone" dataKey="expenses" name={t("expenses")} stroke="#39764a" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <Empty text={t("noRecordsForRange")} />}</ChartCard>
        <ChartCard title={t("cropProduction")}>{data.crops.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.crops} margin={{ bottom: 12 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" interval={0} angle={-15} textAnchor="end" height={55} /><YAxis /><Tooltip formatter={(value) => Number(value).toLocaleString(locale)} /><Bar dataKey="value" name={t("harvestQuantity")} fill="#78a95c" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer> : <Empty text={t("noRecordsForRange")} />}</ChartCard>
        <ChartCard title={t("monthlyProfitLoss")}>{data.summary.expenses || data.summary.revenue ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" /><YAxis tickFormatter={shortMoney} width={70} /><Tooltip formatter={(value) => { const amount = Number(value); const status = profitStatus(amount); return [`${status === "profit" ? "Profit" : status === "loss" ? "Loss" : "Break Even"} · ${money(amount)}`, t("profitLoss")]; }} /><Bar dataKey="profit" name={t("profitLoss")} radius={[5,5,0,0]}>{data.monthly.map(row => <Cell key={row.key} fill={row.profit < 0 ? "#c62828" : row.profit > 0 ? "#286b45" : "#87918a"} />)}</Bar></BarChart></ResponsiveContainer> : <Empty text={t("noRecordsForRange")} />}</ChartCard>
      </div>
    </>}
  </section>;
}
function Metric({ label, value, negative = false, positive = false }: { label: string; value: string; negative?: boolean; positive?: boolean }) { return <article className="panel stat analytics-metric"><span className="muted">{label}</span><strong className={negative ? "negative-number" : positive ? "positive-number" : ""}>{value}</strong></article>; }
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) { return <article className="panel analytics-chart"><h3>{title}</h3>{children}</article>; }
function Empty({text}:{text:string}) { return <div className="analytics-empty">{text}</div>; }
function shortMoney(value: number) { return value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : value >= 1000 ? `₹${(value / 1000).toFixed(0)}k` : `₹${value}`; }
