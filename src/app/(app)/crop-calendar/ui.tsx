"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { calendarContent, calendarLabel, calendarText, type CalendarCatalog } from "@/i18n/crop-calendar/format";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, CloudRain, Clock3, Droplets, Leaf, LoaderCircle, RefreshCw, Sprout, Wheat, X } from "lucide-react";

export type CropCycleOption = { id: string; crop: string; variety: string | null; season: string; farm: string; field: string; state: string; district: string; sowingDate: string; landArea: number; areaUnit: "acre" | "hectare"; soilType: string; irrigationMethod: string; durationDays: number | null; hasCalendarProfile: boolean; requiresVariety: boolean; varietyOptions: string[] };
export type CalendarActivity = { id: string; key: string; name: string; type: string; stage: string | null; date: string; actualDate: string | null; description: string; recommendation: string | null; status: string; isWeatherAdjusted: boolean; isManuallyModified: boolean; notes: string | null; source: string | null; sourceUrl: string | null };
export type CalendarRecord = { id: string; cropCycleId: string; crop: string; farm: string; field: string; state: string; district: string; variety: string | null; sowingDate: string; harvestDate: string | null; observedGrowthStage: string | null; landArea: number; areaUnit: string; soilType: string; irrigationMethod: string; activities: CalendarActivity[] };
type WeatherForecast = { current: { time: string; temperature_2m: number; precipitation: number; relative_humidity_2m: number }; daily: { time: string[]; temperature_2m_min: Array<number | null>; temperature_2m_max: Array<number | null>; precipitation_probability_max: Array<number | null>; precipitation_sum: Array<number | null> }; offlineOnly?: boolean; fallbackReason?: string };
type ApiCalendarActivity = { id: string; activityKey: string; activityName: string; activityType: string; growthStage: string | null; scheduledDate: string; actualCompletionDate: string | null; description: string; recommendation: string | null; status: string; isWeatherAdjusted: boolean; isManuallyModified: boolean; notes: string | null; source: string | null; sourceUrl: string | null };
type ApiCalendar = { id: string; cropCycleId: string; crop: { name: string }; farm: { name: string }; cropCycle: { growthStage: string | null; field: { name: string } }; state: string; district: string; cropVariety: string | null; sowingDate: string; estimatedHarvestDate: string | null; landArea: number | string; areaUnit: string; soilType: string; irrigationMethod: string; activities?: ApiCalendarActivity[] };
type ViewMode = "month" | "week" | "timeline" | "list";

const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const CalendarLanguage = createContext<CalendarCatalog>({});

function useCalendarLanguage() {
  const catalog = useContext(CalendarLanguage);
  const locale = useLocale();
  const formatLocale = locale === "en" ? "en-IN" : `${locale}-IN`;
  const l = (text: string, values?: Record<string, string | number>) => calendarText(catalog, text, values);
  const display = (text: string) => locale === "en" ? text : calendarContent(catalog, text);
  const label = (text: string) => calendarLabel(catalog, locale, text);
  const dateLabel = (key: string) => new Date(`${key}T12:00:00.000Z`).toLocaleDateString(formatLocale, { timeZone: "UTC", dateStyle: "medium" });
  return { locale: formatLocale, l, display, label, dateLabel };
}
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (key: string, days: number) => { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + days); return localDateKey(date); };

type CalendarProps = { initialCycleId?: string; cycles: CropCycleOption[]; calendars: CalendarRecord[]; availableCrops: string[] };

export default function CropCalendarDashboard({ catalog, ...props }: CalendarProps & { catalog: CalendarCatalog }) {
  return <CalendarLanguage.Provider value={catalog}><CalendarPlanner {...props}/></CalendarLanguage.Provider>;
}

function CalendarPlanner({ cycles, calendars: initialCalendars, availableCrops, initialCycleId }: CalendarProps) {
  const t = useTranslations("CropCalendar");
  const { locale, l, display, label, dateLabel } = useCalendarLanguage();
  const [calendars, setCalendars] = useState(initialCalendars);
  const [cycleId, setCycleId] = useState(cycles.find(item => item.id === initialCycleId)?.id ?? cycles[0]?.id ?? "");
  const chosenCycle = cycles.find(item => item.id === cycleId);
  const hasCalendarProfile = chosenCycle?.hasCalendarProfile ?? false;
  const [variety, setVariety] = useState(chosenCycle?.variety || "");
  const [sowingDate, setSowingDate] = useState(chosenCycle?.sowingDate || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(initialCalendars.find(item => item.cropCycleId === initialCycleId)?.id ?? initialCalendars[0]?.id ?? "");
  const [view, setView] = useState<ViewMode>("month");
  const [taskFilter, setTaskFilter] = useState<"all" | "upcoming" | "overdue" | "completed">("all");
  const [cursor, setCursor] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const calendar = calendars.find(item => item.id === selectedId) ?? calendars[0];
  const calendarSowingDate = calendar?.sowingDate;
  const calendarState = calendar?.state;
  const calendarDistrict = calendar?.district;
  const activities = calendar?.activities ?? [];
  const now = todayKey();
  const allActivities = calendars.flatMap(item => item.activities);
  const upcoming = allActivities.filter(item => !["COMPLETED", "CANCELLED", "SKIPPED"].includes(item.status) && item.date >= now).length;
  const completed = allActivities.filter(item => item.status === "COMPLETED").length;
  const pending = allActivities.length - completed;
  const harvestDates = calendars.filter(item => item.harvestDate).map(item => ({ crop: item.crop, date: item.harvestDate! }));
  const milestones = calendar ? growthMilestones(calendar.activities) : [];
  const sowingDay = calendar ? dayDifference(calendar.sowingDate, now) : 0;
  const harvestDay = calendar?.harvestDate ? dayDifference(calendar.sowingDate, calendar.harvestDate) : 0;
  const progressPercent = harvestDay > 0 ? Math.max(0, Math.min(100, Math.round((sowingDay / harvestDay) * 100))) : 0;
  const currentMilestoneIndex = milestones.reduce((latest, item, index) => item.date <= now && item.endDate >= now ? index : latest, -1);
  const nextMilestone = milestones.find(item => item.date > now);
  const currentMilestone = currentMilestoneIndex >= 0 ? milestones[currentMilestoneIndex] : null;
  const beforeSowing = Boolean(calendar && now < calendar.sowingDate);
  const afterHarvest = Boolean(calendar?.harvestDate && now > calendar.harvestDate);
  const currentMilestoneEnd = currentMilestone?.endDate ?? null;
  const harvestWindowStart = activities.find(item => item.key === "harvest-window-start")?.date;
  const harvestWindowEnd = activities.find(item => item.key === "harvest-window-end")?.date;

  useEffect(() => {
    if (calendarSowingDate) setCursor(new Date(`${calendarSowingDate}T12:00:00`));
  }, [calendar?.id, calendarSowingDate]);

  useEffect(() => {
    if (!chosenCycle) return;
    setVariety(chosenCycle.variety || "");
    setSowingDate(chosenCycle.sowingDate || "");
  }, [cycleId, chosenCycle]);
  useEffect(() => {
    if (!calendarState || !calendarDistrict) { setWeather(null); return; }
    let cancelled = false;
    setWeather(null); setWeatherError("");
    fetch(`/api/weather/forecast?state=${encodeURIComponent(calendarState)}&district=${encodeURIComponent(calendarDistrict)}`, { cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error || "Weather forecast is unavailable."); return { ...body.forecast, offlineOnly: body.offlineOnly, fallbackReason: body.fallbackReason } as WeatherForecast; })
      .then(data => { if (!cancelled) setWeather(data); })
      .catch(cause => { if (!cancelled) setWeatherError(cause instanceof Error ? cause.message : "Weather forecast is unavailable."); });
    return () => { cancelled = true; };
  }, [calendar?.id, calendarState, calendarDistrict]);

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/crop-calendar/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cropCycleId: cycleId, cropVariety: variety || undefined, sowingDate }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Calendar generation failed.");
      setMessage(l("Generated {count} activities. Estimated harvest: {date} ({basis}, {days} days).", {
        count: result.generatedCount, date: dateLabel(result.estimatedHarvestDate), basis: display(result.durationBasis), days: result.durationDays,
      }) + " " + l(result.fertilizerProfileMatched ? "A source-matched ICAR fertilizer schedule was included." : "No source-matched fertilizer recipe is configured for this crop and location.") + " " + display(result.scopeNote));
      const refreshed = await fetch("/api/crop-calendar", { cache: "no-store" }).then(value => value.json());
      const mapped = (refreshed.data ?? []).map(mapCalendarFromApi) as CalendarRecord[];
      setCalendars(mapped); const next = mapped.find(item => item.cropCycleId === cycleId); if (next) setSelectedId(next.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Calendar generation failed."); }
    finally { setBusy(false); }
  }
  async function updateActivity(id: string, values: Record<string, unknown>) {
    setError("");
    try {
      const response = await fetch(`/api/crop-calendar/activities/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this activity.");
      setCalendars(current => current.map(item => ({ ...item, activities: item.activities.map(activity => activity.id === id ? mapActivity(result.data) : activity) })));
      setMessage("Activity updated and saved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this activity."); }
  }
  async function completeActivity(id: string) {
    setError("");
    try {
      const response = await fetch(`/api/crop-calendar/activities/${id}/complete`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not complete this activity.");
      setCalendars(current => current.map(item => ({ ...item, activities: item.activities.map(activity => activity.id === id ? mapActivity(result.data) : activity) })));
      setMessage("Activity marked complete.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not complete this activity."); }
  }
  async function removeCalendar() {
    if (!calendar || !window.confirm(l("Delete the generated calendar for {crop}? The crop cycle and farm records will remain.", { crop: label(calendar.crop) }))) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/crop-calendar/${calendar.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete calendar.");
      const rest = calendars.filter(item => item.id !== calendar.id); setCalendars(rest); setSelectedId(rest[0]?.id ?? ""); setMessage("Generated calendar deleted. Your crop cycle and farm records are unchanged.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete calendar."); }
    finally { setBusy(false); }
  }
  async function regenerate() {
    if (!calendar) return; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/crop-calendar/${calendar.id}/regenerate`, { method: "POST" }); const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not regenerate calendar.");
      setMessage("Calendar refreshed. Completed activities were preserved and pending activities recalculated.");
      const body = await fetch("/api/crop-calendar", { cache: "no-store" }).then(value => value.json()); setCalendars((body.data ?? []).map(mapCalendarFromApi));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not regenerate calendar."); } finally { setBusy(false); }
  }
  const visibleDates = useMemo(() => {
    if (view === "month") return { start: new Date(cursor.getFullYear(), cursor.getMonth(), 1), count: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate(), blanks: new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() };
    if (view === "week") {
      const start = new Date(cursor); const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset);
      return { start, count: 7, blanks: 0 };
    }
    return null;
  }, [cursor, view]);
  const dateEvents = new Map<string, CalendarActivity[]>();
  activities.forEach(activity => dateEvents.set(activity.date, [...(dateEvents.get(activity.date) ?? []), activity]));
  const visibleActivities = activities.filter(activity => taskFilter === "all" || (taskFilter === "upcoming" && !["COMPLETED", "CANCELLED", "SKIPPED"].includes(activity.status) && activity.date >= now) || (taskFilter === "overdue" && !["COMPLETED", "CANCELLED", "SKIPPED"].includes(activity.status) && activity.date < now) || (taskFilter === "completed" && activity.status === "COMPLETED")).slice().sort((a, b) => a.date.localeCompare(b.date));

  return <main className="crop-calendar-dashboard">
    <header className="crop-calendar-hero">
      <div className="crop-calendar-hero-copy"><span className="crop-calendar-hero-icon"><Sprout size={23}/></span><div><p className="eyebrow">{t("farmPlanner")}</p><h1>{t("title")}</h1><p>{t("hero")}</p></div></div>
      <div className="crop-calendar-hero-actions">{calendar && <button className="btn btn-glass" type="button" disabled={busy} onClick={regenerate}>{busy ? <LoaderCircle className="spin" size={17}/> : <RefreshCw size={17}/>} {busy ? t("refreshing") : t("refresh")}</button>}<a className="btn btn-light" href="#generate-calendar"><Leaf size={17}/> {t("create")}</a></div>
      {calendar && <div className="crop-calendar-hero-footer"><span><Wheat size={15}/> {t("activeCrops")} · {calendars.length}</span><span><CalendarDays size={15}/> {t("upcomingTasks")} · {upcoming}</span><span><Clock3 size={15}/> {l("Est. harvest")} · {calendar.harvestDate ? dateLabel(calendar.harvestDate) : "—"}</span></div>}
    </header>
    {error && <p className="crop-calendar-feedback error-message" role="alert"><AlertTriangle size={17}/>{display(error)}<button type="button" aria-label={l("Dismiss error")} onClick={() => setError("")}><X size={16}/></button></p>}
    {message && <p className="crop-calendar-feedback success-message" role="status"><Check size={17}/>{display(message)}<button type="button" aria-label={l("Dismiss message")} onClick={() => setMessage("")}><X size={16}/></button></p>}
    <section className="crop-calendar-overview" aria-label={l("Crop calendar overview")}>
      <Metric icon={<Sprout size={19}/>} label={t("activeCrops")} value={calendars.length} tone="green"/><Metric icon={<CalendarDays size={19}/>} label={t("totalActivities")} value={allActivities.length} tone="blue"/><Metric icon={<Check size={19}/>} label={t("completed")} value={completed} tone="mint"/><Metric icon={<Clock3 size={19}/>} label={t("pending")} value={pending} tone="amber"/><Metric icon={<CloudRain size={19}/>} label={t("upcoming")} value={upcoming} tone="sky"/><Metric icon={<Wheat size={19}/>} label={t("harvestEstimates")} value={harvestDates.length} tone="gold"/>
    </section>
    <section className="crop-calendar-generate panel" id="generate-calendar">
      <div className="crop-calendar-section-title"><span className="crop-calendar-section-icon"><Leaf size={19}/></span><div><p className="eyebrow">{t("autoPlanning")}</p><h2>{t("buildPlan")}</h2><p>{t("chooseCycle")}</p></div></div>
      {cycles.length ? <form className="crop-calendar-form" onSubmit={generate}>
        <label className="field"><span>{t("cropField")}</span><select value={cycleId} onChange={event => setCycleId(event.target.value)} required>{cycles.map(item => <option key={item.id} value={item.id}>{label(item.crop)}{item.hasCalendarProfile ? "" : ` · ${t("profileUnavailable")}`} · {item.farm} / {item.field} · {label(item.season)}</option>)}</select></label>
        <label className="field"><span>{l("Sowing date")}</span><input type="date" value={sowingDate} onChange={event => setSowingDate(event.target.value)} required/></label>
        <div className="crop-calendar-field-context"><span><strong>{chosenCycle && label(chosenCycle.crop)} · {chosenCycle?.farm} / {chosenCycle?.field}</strong><small>{t("cropManagementDates")} · {l("Saved crop cycle")}</small></span><span>{chosenCycle && `${label(chosenCycle.district)}, ${label(chosenCycle.state)}`}</span></div>
        {chosenCycle && chosenCycle.varietyOptions.length > 0 && <label className="field"><span>{chosenCycle.requiresVariety ? t("milletType") : l("Variety (optional)")} {chosenCycle.requiresVariety && <small>{t("milletRequired")}</small>}</span><select value={variety} onChange={event => setVariety(event.target.value)} required={chosenCycle.requiresVariety}><option value="">{chosenCycle.requiresVariety ? t("selectMillet") : l("Use crop profile default")}</option>{variety && !chosenCycle.varietyOptions.includes(variety) && <option value={variety}>{variety} · {l("Saved")}</option>}{chosenCycle.varietyOptions.map(option => <option key={option} value={option}>{label(option)}</option>)}</select></label>}
        {chosenCycle && <div className="crop-calendar-field-context"><span className="context-location"><strong>{label(chosenCycle.district)}, {label(chosenCycle.state)}</strong><small>{l("Field conditions")}</small></span><span>{label(chosenCycle.soilType)}</span><i/><span>{label(chosenCycle.irrigationMethod)}</span></div>}
        {chosenCycle && !hasCalendarProfile && <p className="crop-calendar-profile-warning" role="alert"><AlertTriangle size={17}/><span><strong>{l("{crop} has no offline calendar profile yet.", { crop: label(chosenCycle.crop) })}</strong><small>{l("Choose a crop with a configured schedule. Available: {crops}.", { crops: availableCrops.map(label).join(", ") })}</small></span></p>}
        <button className="btn crop-calendar-submit" disabled={busy || !cycleId || !sowingDate || !hasCalendarProfile}>{busy ? <><LoaderCircle className="spin" size={17}/> {t("generating")}</> : <><CalendarDays size={17}/> {t("generate")}</>}</button>
      </form> : <div className="crop-calendar-no-cycle"><p>{t("noCycles")}</p><a className="btn" href="/crops">{t("addCycle")} <ChevronRight size={16}/></a></div>}
    </section>
    {!calendars.length ? <section className="crop-calendar-empty panel"><span><CalendarDays size={29}/></span><h2>{t("emptyTitle")}</h2><p>{t("emptyText")}</p></section> : <>
      <section className="crop-calendar-toolbar panel"><label className="field"><span>{t("calendarView")}</span><select value={calendar?.id ?? ""} onChange={event => setSelectedId(event.target.value)}>{calendars.map(item => <option key={item.id} value={item.id}>{label(item.crop)} · {item.farm} / {item.field} · {dateLabel(item.sowingDate)}</option>)}</select></label><div className="crop-calendar-toolbar-actions">{calendar && <a className="btn btn-secondary" href={`/crops#cycle-${encodeURIComponent(calendar.cropCycleId)}`}>{l("Crop details / observed stage")}</a>}<a className="btn btn-secondary" href="/irrigation"><Droplets size={16}/> {l("Irrigation Planner")}</a>{calendar && <a className="btn btn-secondary" href={`/market?commodity=${encodeURIComponent(calendar.crop)}&state=${encodeURIComponent(calendar.state)}&district=${encodeURIComponent(calendar.district)}`}>{l("Mandi prices")}</a>}<button className="crop-calendar-delete" type="button" disabled={busy} onClick={removeCalendar}>{l("Delete calendar")}</button></div></section>
      {calendar && <section className="crop-calendar-context panel"><div><span>{l("Crop and field")}</span><strong>{label(calendar.crop)} · {calendar.farm} / {calendar.field}</strong></div><div><span>{l("Location")}</span><strong>{label(calendar.district)}, {label(calendar.state)}</strong></div><div><span>{l("Sowing date")}</span><strong>{dateLabel(calendar.sowingDate)}</strong></div><div><span>{l("Est. harvest")}</span><strong>{calendar.harvestDate ? dateLabel(calendar.harvestDate) : l("Not available")}</strong></div><div><span>{l("Land and soil")}</span><strong>{calendar.landArea} {label(calendar.areaUnit)} · {label(calendar.soilType)}</strong></div></section>}
      {calendar && milestones.length > 0 && <section className="crop-growth-progress panel">
        <div className="crop-growth-progress-heading"><div><p className="eyebrow">{l("SMART CROP CALENDAR")}</p><h2>{l("Crop growth progress")}</h2><p>{label(calendar.crop)} · {l("{days} days after sowing", { days: Math.max(0, sowingDay) })}</p></div><strong>{progressPercent}%</strong></div>
        <div className="crop-growth-progress-track" role="progressbar" aria-label={l("Estimated crop growth progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}><span style={{ width: `${progressPercent}%` }}/></div>
        <p className="crop-growth-next">{beforeSowing
          ? l("Sowing is planned for {date}. First stage: {stage}.", { date: dateLabel(calendar.sowingDate), stage: label(milestones[0].stage) })
          : afterHarvest ? l("The estimated crop period has ended. Record the actual harvest status in Crop Management.")
          : currentMilestone ? l("Estimated current stage: {stage} ({start}–{end}).", { stage: label(currentMilestone.stage), start: dateLabel(currentMilestone.date), end: dateLabel(currentMilestoneEnd ?? currentMilestone.date) })
          : l("Next stage: {stage}.", { stage: label(nextMilestone?.stage ?? milestones[0].stage) })}
          {!beforeSowing && !afterHarvest && currentMilestone && nextMilestone && <> · {l("Next stage: {stage} on {date} (in {days} days).", { stage: label(nextMilestone.stage), date: dateLabel(nextMilestone.date), days: dayDifference(now, nextMilestone.date) })}</>}
          {calendar.harvestDate && <> · {l("Est. harvest")} · {harvestWindowStart && harvestWindowEnd ? `${dateLabel(harvestWindowStart)}–${dateLabel(harvestWindowEnd)}` : dateLabel(calendar.harvestDate)}</>}
        </p>
        {calendar.observedGrowthStage && <p className="crop-growth-observed">{l("Stage observed in your field: {stage}. This may differ from the estimate.", { stage: label(calendar.observedGrowthStage) })}</p>}
        <div className="crop-growth-milestones">{milestones.map((item, index) => { const state = item.activity.status === "COMPLETED" ? "complete" : item.endDate < now ? "elapsed" : index === currentMilestoneIndex ? "current" : "upcoming"; const stateLabel = state === "complete" ? t("completed") : state === "elapsed" ? l("Estimated date passed") : state === "current" ? l("Current estimated stage") : t("upcoming"); return <article className={`crop-growth-milestone ${state}`} key={item.activity.id}><span className="crop-growth-milestone-dot">{state === "complete" ? <Check size={13}/> : index + 1}</span><div><strong>{label(item.stage)}</strong><small>{dateLabel(item.date)}–{dateLabel(item.endDate)} · {stateLabel}</small></div></article>; })}</div>
        {currentMilestone && <div className="crop-growth-details"><h3>{l("Current stage details")} · {label(currentMilestone.stage)}</h3><p>{display(currentMilestone.activity.description)}</p><p>{currentMilestone.activity.recommendation && display(currentMilestone.activity.recommendation)}</p><div>
          <span><Droplets size={15}/> {l("Check soil moisture and open the irrigation planner if needed.")}</span>
          <span><Leaf size={15}/> {l("Use the soil test and local crop advice before choosing fertilizer.")}</span>
          <span>{l("Look for weeds competing with the crop.")}</span>
          <span>{l("Look for insects and crop damage. Ask a local expert before treating.")}</span>
        </div></div>}
        <small className="crop-growth-note">{l("Stage dates are estimates. Mark an activity complete after you finish it.")}</small>
      </section>}
      {calendar?.harvestDate && <section className="panel crop-calendar-context"><div><span>{t("harvestCountdown")}</span><strong>{Math.max(0, Math.ceil((Date.parse(`${calendar.harvestDate}T00:00:00Z`) - Date.parse(`${now}T00:00:00Z`)) / 86400000))} {t("days")}</strong></div></section>}
      <WeatherPanel weather={weather} error={weatherError} activities={activities}/>
      <div className="crop-calendar-tabs crop-calendar-task-filters" role="group" aria-label={l("Task status")}>{(["all", "upcoming", "overdue", "completed"] as const).map(filter => <button type="button" key={filter} className={taskFilter === filter ? "active" : ""} onClick={() => setTaskFilter(filter)}>{filter === "all" ? t("activities") : filter === "upcoming" ? t("upcomingTasks") : filter === "overdue" ? t("overdueTasks") : t("completedTasks")}</button>)}</div>
      <section className="crop-calendar-views panel"><div className="crop-calendar-view-heading"><div><p className="eyebrow">{l("ACTIVITY PLANNER")}</p><h2>{view === "month" ? cursor.toLocaleDateString(locale, { month: "long", year: "numeric" }) : view === "week" ? l("This week") : view === "timeline" ? l("Crop timeline") : l("All activities")}</h2><p className="muted">{calendar && label(calendar.crop)} · {l("{count} scheduled activities", { count: visibleActivities.length })}</p></div><div className="crop-calendar-view-controls"><div className="crop-calendar-tabs" role="tablist" aria-label={l("Calendar view")}>{(["month", "week", "timeline", "list"] as ViewMode[]).map(item => <button type="button" role="tab" aria-selected={view === item} key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item === "month" ? l("Month") : item === "week" ? l("Week") : item === "timeline" ? l("Timeline") : l("List")}</button>)}</div>{(view === "month" || view === "week") && <div className="crop-calendar-date-nav"><button type="button" aria-label={l("Previous")} onClick={() => setCursor(value => view === "week" ? new Date(value.getFullYear(), value.getMonth(), value.getDate() - 7) : new Date(value.getFullYear(), value.getMonth() - 1, 1))}><ChevronLeft size={17}/></button><button type="button" onClick={() => setCursor(new Date())}>{l("Today")}</button><button type="button" aria-label={l("Next")} onClick={() => setCursor(value => view === "week" ? new Date(value.getFullYear(), value.getMonth(), value.getDate() + 7) : new Date(value.getFullYear(), value.getMonth() + 1, 1))}><ChevronRight size={17}/></button></div>}</div></div>
        {view === "month" && visibleDates && <div className="smart-calendar-grid"><div className="smart-calendar-weekdays">{Array.from({ length: 7 }, (_, day) => <strong key={day}>{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + day)))}</strong>)}</div><div className="smart-calendar-month-cells">{Array.from({ length: visibleDates.blanks }, (_, index) => <span className="calendar-blank" key={`blank-${index}`}/>)}{Array.from({ length: visibleDates.count }, (_, index) => { const date = new Date(visibleDates.start.getFullYear(), visibleDates.start.getMonth(), index + 1); const key = localDateKey(date); return <article className={key === now ? "is-today" : ""} key={key}><b>{index + 1}</b>{(dateEvents.get(key) ?? []).slice(0, 3).map(activity => <button type="button" key={activity.id} className={`smart-calendar-event status-${effectiveStatus(activity, now).toLowerCase()}`} title={display(activity.name)} onClick={() => document.getElementById(`activity-${activity.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>{display(activity.name)}</button>)}{(dateEvents.get(key)?.length ?? 0) > 3 && <small>{l("+{count} more", { count: (dateEvents.get(key)?.length ?? 0) - 3 })}</small>}</article>; })}</div></div>}
        {view === "week" && visibleDates && <div className="crop-calendar-week-list">{Array.from({ length: 7 }, (_, index) => { const date = new Date(visibleDates.start); date.setDate(date.getDate() + index); const key = localDateKey(date); return <div key={key}><strong>{dateLabel(key)}</strong>{(dateEvents.get(key) ?? []).map(item => <span key={item.id}>{display(item.name)} · {l(effectiveStatus(item, now))}</span>)}</div>; })}</div>}
        {(view === "timeline" || view === "list") && <div className="crop-calendar-timeline">{visibleActivities.length ? visibleActivities.map(activity => <ActivityCard key={activity.id} activity={activity} today={now} calendar={calendar} weather={weather} onComplete={completeActivity} onUpdate={updateActivity}/>) : <EmptyActivities/>}</div>}
        {(view === "month" || view === "week") && <div className="crop-calendar-selected-list"><div className="crop-calendar-list-heading"><h3>{l("Scheduled activities")}</h3><span>{l("{count} total", { count: visibleActivities.length })}</span></div>{visibleActivities.length ? visibleActivities.map(activity => <ActivityCard key={activity.id} activity={activity} today={now} calendar={calendar} weather={weather} onComplete={completeActivity} onUpdate={updateActivity}/>) : <EmptyActivities/>}</div>}
      </section>
      <p className="crop-calendar-disclaimer">{l("Dates are planning estimates based on the selected crop profile. Check local KVK or agricultural university guidance for field-specific decisions. Seven-day weather adds review alerts only and never shifts biological dates.")}</p>
    </>}
  </main>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) { return <article className={`crop-calendar-metric tone-${tone}`}><span className="crop-calendar-metric-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>; }

function dayDifference(from: string, to: string) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000); }
function growthMilestones(activities: CalendarActivity[]) {
  const phases = activities.filter(item => item.key === "sowing" || item.key.startsWith("phase-")).sort((a, b) => a.date.localeCompare(b.date));
  return phases.map((activity, index) => ({ activity, date: activity.date, endDate: phases[index + 1] ? addDays(phases[index + 1].date, -1) : activity.date, stage: activity.stage || activity.name }));
}

function EmptyActivities() { const t = useTranslations("CropCalendar"); return <div className="crop-calendar-no-activities"><span><CalendarDays size={23}/></span><strong>{t("noActivities")}</strong><small>{t("refreshHint")}</small></div>; }

function ActivityCard({ activity, today, calendar, weather, onComplete, onUpdate }: { activity: CalendarActivity; today: string; calendar?: CalendarRecord; weather: WeatherForecast | null; onComplete: (id: string) => void; onUpdate: (id: string, value: Record<string, unknown>) => void }) {
  const t = useTranslations("CropCalendar");
  const { locale, l, display, label, dateLabel } = useCalendarLanguage();
  const status = effectiveStatus(activity, today);
  const alert = activityWeatherAlert(activity, weather);
  return <article id={`activity-${activity.id}`} className={`crop-calendar-activity status-${status.toLowerCase()}`}>
    <div className="crop-calendar-activity-date"><span className="activity-date-icon"><CalendarDays size={17}/></span><strong>{dateLabel(activity.date)}</strong><span className={`crop-calendar-status status-${status.toLowerCase()}`}>{status === "COMPLETED" ? <Check size={13}/> : status === "DELAYED" ? <AlertTriangle size={13}/> : <Clock3 size={13}/>} {status === "COMPLETED" ? t("completed") : status === "DELAYED" ? t("overdueTasks") : status === "CANCELLED" ? l(status) : t("pending")}</span></div>
    <div className="crop-calendar-activity-main"><div className="crop-calendar-activity-title"><div><p className="crop-calendar-activity-type">{l(activity.type.replaceAll("_", " "))}</p><h3>{display(activity.name)}</h3></div><div className="crop-calendar-activity-title-actions">{!["COMPLETED", "CANCELLED", "SKIPPED"].includes(activity.status) && <button type="button" className="crop-calendar-quick-complete" onClick={() => onComplete(activity.id)}><Check size={14}/> {t("complete")}</button>}{activity.isManuallyModified && <span className="manual-badge">{l("Edited")}</span>}</div></div><p className="crop-calendar-activity-meta">{calendar && label(calendar.crop)} <i/> {activity.stage ? label(activity.stage) : t("notRecorded")} <i/> {calendar?.field}</p><p className="activity-description">{display(activity.description)}</p>{activity.recommendation && <p className="crop-calendar-recommendation">{display(activity.recommendation)}</p>}{alert && <p className="crop-calendar-weather-alert" role="status"><AlertTriangle size={15}/>{display(alert)}</p>}{activity.sourceUrl && <a className="crop-calendar-source" href={activity.sourceUrl} target="_blank" rel="noreferrer">{t("source")}: {activity.source ? display(activity.source) : l("Agricultural reference")} <ChevronRight size={13}/></a>}{activity.actualDate && <small className="activity-completion-date"><Check size={13}/> {t("completed")} {new Date(activity.actualDate).toLocaleDateString(locale, { timeZone: "Asia/Kolkata" })}</small>}
      {activity.status !== "CANCELLED" && <details className="crop-calendar-edit"><summary>{t("edit")}</summary><div className="crop-calendar-activity-actions">{activity.status === "COMPLETED" ? <button type="button" className="btn btn-secondary" onClick={() => onUpdate(activity.id, { status: "PENDING" })}>{t("markPending")}</button> : <button type="button" className="btn crop-calendar-complete" onClick={() => onComplete(activity.id)}><Check size={15}/> {t("markComplete")}</button>}<label className="field"><span>{t("reschedule")}</span><input type="date" defaultValue={activity.date} onChange={event => { if (event.target.value && event.target.value !== activity.date) onUpdate(activity.id, { scheduledDate: event.target.value }); }}/></label><label className="field"><span>{t("notes")}</span><input defaultValue={activity.notes ?? ""} maxLength={500} placeholder={t("fieldNote")} onBlur={event => { if (event.target.value !== (activity.notes ?? "")) onUpdate(activity.id, { notes: event.target.value }); }}/></label></div></details>}
    </div>
  </article>;
}

function WeatherPanel({ weather, error, activities }: { weather: WeatherForecast | null; error: string; activities: CalendarActivity[] }) {
  const t = useTranslations("CropCalendar");
  const { locale, l, display, dateLabel } = useCalendarLanguage();
  const alerts = weather && !weather.offlineOnly ? weatherAlerts(weather) : [];
  return <section className="crop-calendar-weather panel"><div className="crop-calendar-subheading"><div><span className="weather-icon"><CloudRain size={19}/></span><div><p className="eyebrow">{weather?.offlineOnly ? l("OFFLINE SAMPLE · 7 DAY") : l("OPEN-METEO · 7 DAY")}</p><h2>{t("weather")}</h2></div></div>{weather && !error && <span className="weather-live-label"><i/> {weather.offlineOnly ? l("Offline demonstration") : t("liveForecast")}</span>}</div>{error ? <p className="crop-calendar-weather-error" role="status"><AlertTriangle size={17}/> {t("weatherUnavailable")} · {l("Calendar dates remain unchanged.")}</p> : !weather ? <p className="crop-calendar-loading"><LoaderCircle className="spin" size={17}/> {l("Loading approximate district weather…")}</p> : <><div className="crop-calendar-current-weather"><strong>{weather.current.temperature_2m}°</strong><div><span>{weather.offlineOnly ? l("Demonstration values · not observed weather") : l("Current temperature")}</span><small>{l("Humidity {humidity}% · Rain {rain} mm", { humidity: weather.current.relative_humidity_2m, rain: weather.current.precipitation })}</small></div></div>{weather.offlineOnly && <p className="crop-calendar-weather-error" role="status"><AlertTriangle size={17}/> {l("Open-Meteo could not be reached. Showing offline demonstration values; do not use these as a forecast.")}</p>}{alerts.length ? <div className="crop-calendar-weather-alerts">{alerts.map(item => <p key={item}><AlertTriangle size={15}/>{display(item)}</p>)}</div> : !weather.offlineOnly && <p className="crop-calendar-weather-ok"><Check size={15}/> {l("No severe-weather thresholds in this forecast. Continue to monitor field conditions.")}</p>}<div className="crop-calendar-forecast">{weather.daily.time.map((date, index) => { const tasks = activities.filter(item => item.date === date && activityWeatherAlert(item, weather)); return <article key={date}><strong>{new Date(`${date}T12:00:00.000Z`).toLocaleDateString(locale, { timeZone: "UTC", weekday: "short" })}</strong><small>{dateLabel(date)}</small><span className="forecast-temp">{weather.daily.temperature_2m_max[index] ?? "—"}° <small>{weather.daily.temperature_2m_min[index] ?? "—"}°</small></span><span className="forecast-rain"><CloudRain size={14}/> {weather.daily.precipitation_probability_max[index] ?? "—"}% · {weather.daily.precipitation_sum[index] ?? "—"} mm</span>{tasks.length > 0 && <span className="forecast-task"><AlertTriangle size={13}/> {l("{count} task alerts", { count: tasks.length })}</span>}</article>; })}</div><p className="crop-calendar-weather-note">{weather.offlineOnly ? l("These generated values are for demonstration only. Do not use for farm decisions.") : l("District weather is approximate. Forecast rain is not treated as measured soil moisture.")}</p></>}</section>;
}

function activityWeatherAlert(activity: CalendarActivity, weather: WeatherForecast | null) {
  if (!weather || weather.offlineOnly) return "";
  const index = weather.daily.time.indexOf(activity.date); if (index < 0) return "";
  const rain = weather.daily.precipitation_sum[index] ?? 0; const chance = weather.daily.precipitation_probability_max[index] ?? 0;
  if (activity.type === "IRRIGATION_REVIEW" && (rain >= 10 || chance >= 70)) return "Rain is forecast; review irrigation timing using field moisture. Forecast rain is not counted as effective rainfall.";
  if (activity.type === "FERTILIZER" && (rain >= 25 || chance >= 80)) return "Heavy rain may affect field work; review timing with local guidance. Calendar date was not changed.";
  const low = weather.daily.temperature_2m_min[index]; const high = weather.daily.temperature_2m_max[index];
  if ((low !== null && low <= 2) || (high !== null && high >= 40)) return "Adverse temperature is forecast; review crop and worker safety using local advisories.";
  if (rain >= 50) return "Heavy rain is forecast; review field access and drainage.";
  return "";
}

function weatherAlerts(weather: WeatherForecast) {
  const alerts: string[] = [];
  if (weather.daily.temperature_2m_min.some(value => value !== null && value <= 2)) alerts.push("Frost threshold in forecast: minimum temperature at or below 2°C. Check sensitive crops and local advisories.");
  if (weather.daily.temperature_2m_max.some(value => value !== null && value >= 40)) alerts.push("Heat threshold in forecast: maximum temperature at or above 40°C. Monitor crop and worker heat stress.");
  if (weather.daily.precipitation_sum.some((value, index) => value !== null && (value >= 50 || ((weather.daily.precipitation_probability_max[index] ?? 0) >= 80 && value >= 25)))) alerts.push("Heavy rainfall is possible. Review drainage and postpone field work where soils are wet.");
  return alerts;
}

function effectiveStatus(activity: CalendarActivity, today: string) { return activity.status === "PENDING" && activity.date < today ? "DELAYED" : activity.status; }
function mapActivity(value: ApiCalendarActivity): CalendarActivity { return { id: value.id, key: value.activityKey, name: value.activityName, type: value.activityType, stage: value.growthStage, date: new Date(value.scheduledDate).toISOString().slice(0, 10), actualDate: value.actualCompletionDate, description: value.description, recommendation: value.recommendation, status: value.status, isWeatherAdjusted: value.isWeatherAdjusted, isManuallyModified: value.isManuallyModified, notes: value.notes, source: value.source, sourceUrl: value.sourceUrl }; }
function mapCalendarFromApi(value: ApiCalendar): CalendarRecord { return { id: value.id, cropCycleId: value.cropCycleId, crop: value.crop.name, farm: value.farm.name, field: value.cropCycle.field.name, state: value.state, district: value.district, variety: value.cropVariety, sowingDate: new Date(value.sowingDate).toISOString().slice(0, 10), harvestDate: value.estimatedHarvestDate ? new Date(value.estimatedHarvestDate).toISOString().slice(0, 10) : null, observedGrowthStage: value.cropCycle.growthStage, landArea: Number(value.landArea), areaUnit: value.areaUnit, soilType: value.soilType, irrigationMethod: value.irrigationMethod, activities: (value.activities ?? []).map(mapActivity) }; }
