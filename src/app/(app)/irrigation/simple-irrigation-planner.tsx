"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import plannerConfig from "@/data/irrigation/simple-planner.json";
import soilReference from "@/data/irrigation/soil_reference.json";
import cropWater from "@/data/irrigation/crop_water_parameters.json";
import { calculateSimpleIrrigation } from "@/lib/simple-irrigation-planner";

export type PlannerCycle = {
  id: string; crop: string; stage: string | null; status: string; farm: string; field: string; state: string; district: string;
  area: number; areaUnit: string; soil: string; method: string;
};
export type PlannerHistoryRow = {
  id: string; cropCycleId: string; crop: string; field: string; date: string; completed: boolean; status: string;
  method: string | null; recommendedLiters: number | null; actualLiters: number | null; note: string | null; isCheckOnly: boolean;
};
export type IrrigationReport = {
  totalLiters: number; completedCount: number;
  byCrop: Array<{ crop: string; liters: number; count: number }>;
  byMonth: Array<{ month: string; label: string; liters: number; count: number }>;
};
type PlannerResult = ReturnType<typeof calculateSimpleIrrigation> & { manualRainfallScenarioMm?: number };

const soils = ["Sandy Soil", "Sandy Loam", "Loamy Soil", "Clay Loam", "Clay Soil"];
const fmtLiters = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const formatRange = (min: number | undefined, max: number | undefined, digits = 2) =>
  min === undefined || max === undefined ? "—" : min === max ? min.toFixed(digits) : `${min.toFixed(digits)}–${max.toFixed(digits)}`;
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function SimpleIrrigationPlanner({ cycles, recordCycles, history, reports }: { cycles: PlannerCycle[]; recordCycles: PlannerCycle[]; history: PlannerHistoryRow[]; reports: IrrigationReport }) {
  const router = useRouter();
  const t = useTranslations("Irrigation");
  const [cycleId, setCycleId] = useState(cycles[0]?.id ?? "");
  const cycle = useMemo(() => cycles.find(item => item.id === cycleId), [cycles, cycleId]);
  const [soil, setSoil] = useState(() => matchSoil(cycles[0]?.soil));
  const [stage, setStage] = useState(() => matchStage(cycles[0]?.stage));
  const [method, setMethod] = useState(() => matchMethod(cycles[0]?.method));
  const [weatherMode, setWeatherMode] = useState<"offline" | "online">("offline");
  const [calculationDate, setCalculationDate] = useState(today);
  const [moistureMeasuredDate, setMoistureMeasuredDate] = useState(today);
  const [rainfallMm, setRainfallMm] = useState("");
  const [fieldCapacityPercent, setFieldCapacityPercent] = useState("");
  const [wiltingPointPercent, setWiltingPointPercent] = useState("");
  const [currentMoisturePercent, setCurrentMoisturePercent] = useState("");
  const [rootZoneDepthM, setRootZoneDepthM] = useState("");
  const [result, setResult] = useState<PlannerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recordCycleId, setRecordCycleId] = useState(recordCycles[0]?.id ?? "");
  const [recordDate, setRecordDate] = useState(today);
  const [recordLiters, setRecordLiters] = useState("");
  const [recordNotes, setRecordNotes] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const transactionId = useRef<string | null>(null);
  const recordInFlight = useRef(false);

  function changeCycle(id: string) {
    const next = cycles.find(item => item.id === id);
    const nextSoil = matchSoil(next?.soil);
    setCycleId(id); setRecordCycleId(id); setSoil(nextSoil); setStage(matchStage(next?.stage)); setMethod(matchMethod(next?.method));
    setFieldCapacityPercent("");
    setWiltingPointPercent("");
    setRootZoneDepthM(""); setCurrentMoisturePercent(""); setResult(null);
  }
  function clearPlan() { setResult(null); setMessage(""); }
  async function sendPlanner(save: boolean) {
    if (!cycle) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const optionalNumber = (value: string) => value === "" ? undefined : Number(value);
      const moisture = {
        fieldCapacityPercent: optionalNumber(fieldCapacityPercent),
        wiltingPointPercent: optionalNumber(wiltingPointPercent),
        currentPercent: optionalNumber(currentMoisturePercent),
        rootZoneDepthM: optionalNumber(rootZoneDepthM),
      };
      const response = await fetch("/api/irrigation/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(35_000),
        body: JSON.stringify({
          cropCycleId: cycle.id, soil, growthStage: stage, method,
          weatherMode: weatherMode === "online" ? "live" : "offline",
          calculationDate, moistureMeasuredDate, moisture,
          manualRainfallScenarioMm: optionalNumber(rainfallMm), save,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "The planner could not complete the request.");
      const nextResult = payload.data as PlannerResult;
      setResult(nextResult);
      const exactGrossAmount = nextResult.grossRequirementLitersMin !== undefined
        && nextResult.grossRequirementLitersMin === nextResult.grossRequirementLitersMax
        ? nextResult.grossRequirementLitersMin
        : undefined;
      if (nextResult.available && nextResult.irrigationDue && exactGrossAmount !== undefined) setRecordLiters(exactGrossAmount.toFixed(2));
      else setRecordLiters("");
      if (save) {
        setMessage(`${payload.duplicate ? t("duplicateReminder") : t("savedReminder")} ${payload.scheduledAt}.`);
        router.refresh();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The planner could not complete the request."); }
    finally { setBusy(false); }
  }
  async function recordWater(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recordInFlight.current) return;
    recordInFlight.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const editing = editingRecordId !== null;
      if (!editing) {
        const fingerprint = JSON.stringify([recordCycleId, recordDate, Number(recordLiters), method, recordNotes.trim()]);
        const storageKey = "agritrack-irrigation-pending-transaction";
        try {
          const pending = sessionStorage.getItem(storageKey);
          const parsed = pending ? JSON.parse(pending) as { fingerprint?: string; id?: string } : null;
          transactionId.current = parsed?.fingerprint === fingerprint && parsed.id ? parsed.id : globalThis.crypto.randomUUID();
          sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, id: transactionId.current }));
        } catch { transactionId.current ??= globalThis.crypto.randomUUID(); }
      }
      const response = await fetch(editing ? `/api/irrigation/history/${editingRecordId}` : "/api/irrigation/history", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(editing ? {} : { transactionId: transactionId.current }), cropCycleId: recordCycleId, irrigationDate: recordDate, waterAppliedLiters: Number(recordLiters), method, notes: recordNotes }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(t("couldNotSaveWatering"));
      setMessage(editing ? t("wateringUpdated") : payload.duplicate ? t("wateringDuplicate") : t("wateringSaved"));
      setEditingRecordId(null); transactionId.current = null;
      try { sessionStorage.removeItem("agritrack-irrigation-pending-transaction"); } catch { /* Session storage can be unavailable; the server still enforces the transaction key. */ }
      setRecordDate(today()); setRecordLiters(""); setRecordNotes(""); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save watering record."); }
    finally { recordInFlight.current = false; setBusy(false); }
  }

  function editWateringRecord(item: PlannerHistoryRow) {
    setEditingRecordId(item.id); setRecordDate(item.date);
    setRecordLiters(String(item.actualLiters ?? "")); setMethod(item.method ?? "Drip Irrigation"); setRecordNotes(item.note ?? "");
    clearPlan();
    setError(""); setMessage(""); document.getElementById("record-watering")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function deleteWateringRecord(item: PlannerHistoryRow) {
    if (!window.confirm(t("confirmDelete"))) return;
    setDeletingRecordId(item.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/irrigation/history/${item.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(t("couldNotDelete"));
      setMessage(t("rainDeleted")); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("couldNotDelete")); }
    finally { setDeletingRecordId(null); }
  }

  async function deletePlannedCheck(item: PlannerHistoryRow) {
    if (!window.confirm(t("confirmDeleteReminder"))) return;
    setDeletingRecordId(item.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/irrigation/history/${item.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(t("couldNotDelete"));
      setMessage(t("reminderDeleted")); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("couldNotDelete")); }
    finally { setDeletingRecordId(null); }
  }

  const completedRows = history.filter(item => item.completed && item.actualLiters !== null);
  const editingRecord = completedRows.find(item => item.id === editingRecordId);
  const plannedRows = history.filter(item => !item.completed);

  return <div className="irrigation-page simple-planner-page">
    <header className="irrigation-heading"><div><p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><p className="muted">{t("subtitle")}</p></div></header>
    {!cycles.length ? <section className="panel"><h2>{t("noCrop")}</h2><p className="muted">{t("addCycle")}</p><a className="btn" href="/crops">{t("openCrops")}</a></section> : <>
      <section className="panel simple-irrigation-card">
        <h2>{t("planTitle")}</h2>
        <p className="muted">{t("planDescription")}</p>
        <form className="simple-planner-form" onSubmit={event => { event.preventDefault(); void sendPlanner(false); }}>
          <label className="field"><span>{t("cropField")}</span><select value={cycleId} onChange={event => changeCycle(event.target.value)}>{cycles.map(item => <option key={item.id} value={item.id}>{item.crop} · {item.farm} / {item.field}</option>)}</select>{cycle && <small>{cycle.area} {cycle.areaUnit} · {cycle.district}, {cycle.state}</small>}</label>
          <label className="field"><span>{t("calculationDate")}</span><input type="date" min={today()} value={calculationDate} onChange={event => { setCalculationDate(event.target.value); clearPlan(); }}/><small>{t("calculationDateHint")}</small></label>
          <label className="field"><span>{t("moistureMeasuredDate")}</span><input type="date" max={today()} value={moistureMeasuredDate} onChange={event => { setMoistureMeasuredDate(event.target.value); clearPlan(); }}/><small>{t("moistureMeasuredDateHint")}</small></label>
          <label className="field"><span>{t("soil")}</span><select value={soil} onChange={event => { setSoil(event.target.value); setFieldCapacityPercent(""); setWiltingPointPercent(""); clearPlan(); }}>{soils.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>{t("stage")}</span><select value={stage} onChange={event => { setStage(event.target.value); clearPlan(); }}>{plannerConfig.stages.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>{t("method")}</span><select value={method} onChange={event => { setMethod(event.target.value); clearPlan(); }}>{plannerConfig.methods.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>{t("rainfall")}</span><input type="number" min="0" max="1000" step="0.1" value={rainfallMm} onChange={event => { setRainfallMm(event.target.value); clearPlan(); }}/><small>{t("rainfallHint")}</small></label>
          <label className="field"><span>{t("etoMode")}</span><select value={weatherMode} onChange={event => { setWeatherMode(event.target.value as "offline" | "online"); clearPlan(); }}><option value="offline">{t("offlineDataset")}</option><option value="online">{t("onlineDataset")}</option></select><small>{weatherMode === "offline" ? t("offlineEtoHint") : t("onlineEtoHint")}</small></label>
          <details className="irrigation-soil-inputs"><summary>{t("soilOverrides")}</summary><p className="muted">{t("typicalNote")}</p>
            <label className="field"><span>{t("fieldCapacity")}</span><input type="number" min="0.1" max="100" step="0.1" value={fieldCapacityPercent} onChange={event => { setFieldCapacityPercent(event.target.value); clearPlan(); }}/><small>{t("typicalValue")} {soilReference.soils.find(row => row.soil === soil)?.fieldCapacityPercent ?? t("unavailable")}%</small></label>
            <label className="field"><span>{t("wiltingPoint")}</span><input type="number" min="0" max="99.9" step="0.1" value={wiltingPointPercent} onChange={event => { setWiltingPointPercent(event.target.value); clearPlan(); }}/><small>{t("typicalValue")} {soilReference.soils.find(row => row.soil === soil)?.wiltingPointPercent ?? t("unavailable")}%</small></label>
            <label className="field"><span>{t("rootDepth")}</span><input type="number" min="0.05" max="3" step="0.01" value={rootZoneDepthM} onChange={event => { setRootZoneDepthM(event.target.value); clearPlan(); }}/><small>{t("typicalValue")} {cropWater.crops.find(row => row.crop.toLowerCase() === cycle?.crop.toLowerCase())?.schedulingRootDepthM ?? t("unavailable")} m</small></label>
            <label className="field"><span>{t("currentMoisture")}</span><input type="number" min="0" max="100" step="0.1" value={currentMoisturePercent} onChange={event => { setCurrentMoisturePercent(event.target.value); clearPlan(); }}/><small>{t("currentMoistureHint")}</small></label>
          </details>
          <div className="simple-planner-actions"><button className="btn" disabled={busy}>{busy ? t("working") : t("calculate")}</button>{result?.available && result.nextIrrigationInDays !== undefined && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void sendPlanner(true)}>{t("saveCheck")}</button>}</div>
        </form>
        {error && <p role="alert" className="irrigation-alert">{error}</p>}{message && <p role="status" className="irrigation-success">{message}</p>}
        {result && <section className="simple-planner-result" aria-live="polite">
          <div className="simple-planner-result-heading"><div><p className="eyebrow">{t("estimate")}</p><h3>{t("waterBalance")}</h3></div>{result.available && <span className={`planner-decision ${result.irrigationDue ? "due" : "wait"}`}>{result.irrigationDue ? t("thresholdReached") : t("noIrrigationDue")}</span>}</div>
          <div className="planner-demand"><div><span>{t("dailyEtc")}</span><strong>{formatRange(result.etcMinMmPerDay, result.etcMaxMmPerDay)} mm/day</strong></div><p><b>ETo</b> {result.et0MmPerDay?.toFixed(2) ?? t("unavailable")} mm/day × <b>Kc</b> {formatRange(result.kcMin, result.kcMax)}</p></div>
          {result.available ? <><div className="simple-planner-metrics"><article><span>{t("depletion")}</span><strong>{result.depletionMm?.toFixed(1)} <small>mm</small></strong><small>{result.balanceElapsedDays === 0 ? t("measuredBalance") : `${result.balanceElapsedDays} ${t("projectedDays")}`}</small></article><article><span>{t("raw")}</span><strong>{result.allowableDepletionMm?.toFixed(1)} <small>mm</small></strong><small>{t("thresholdHint")}</small></article><article><span>{t("netWater")}</span><strong>{result.netRequirementMm?.toFixed(1)} <small>mm</small></strong><small>{t("rootZoneWater")}</small></article><article><span>{t("grossWater")}</span><strong>{formatRange(result.grossRequirementLitersMin, result.grossRequirementLitersMax, 0)} <small>L</small></strong><small>{formatRange(result.grossRequirementLitersMin === undefined ? undefined : result.grossRequirementLitersMin / 1000, result.grossRequirementLitersMax === undefined ? undefined : result.grossRequirementLitersMax / 1000)} kL · {result.source.method}</small></article></div><div className={`planner-decision-note ${result.irrigationDue ? "due" : "wait"}`}><strong>{result.irrigationDue ? t("irrigationRecommended") : t("noWatering")}</strong></div></> : <div className="simple-planner-caution"><strong>{t("waterUnavailable")}</strong><ul>{result.missing.map(item => <li key={item}>{result.weatherMode === "live" && item.includes("Live weather") ? t("onlineEtoUnavailable") : item}</li>)}</ul></div>}
          <div className="rainfall-balance-strip"><article><span>{t("grossRainfall")}</span><strong>{fmtLiters(result.grossRainfallMm)} mm</strong></article><article><span>{t("effectiveRainfall")}</span><strong>{fmtLiters(result.effectiveRainfallMm)} mm</strong></article><p><b>{t("source")}</b> {result.rainfallNote}{result.manualRainfallScenarioMm !== undefined ? ` Manual rainfall entered: ${fmtLiters(result.manualRainfallScenarioMm)} mm; not credited.` : ""}</p></div>
          <details><summary>{t("parameterSources")}</summary><ul><li>ETo: {result.et0MmPerDay === undefined ? t("unavailable") : `${result.et0MmPerDay.toFixed(2)} mm/day`} · {result.weatherMode === "live" ? `${t("openMeteoCurrentDay")}${result.liveWeatherDate ? ` · ${result.liveWeatherDate}` : ""}${result.weatherRetrievedAt ? ` · ${t("retrievedAt")} ${new Date(result.weatherRetrievedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}` : `${result.source.climate} ${result.source.climateLocation}`} <a href={result.source.climateSourceUrl} target="_blank" rel="noreferrer">{t("reference")}</a></li><li>Kc {formatRange(result.kcMin, result.kcMax)} · {cycle?.crop}, {stage}; {result.source.cropVerification}. <a href={result.source.cropUrl} target="_blank" rel="noreferrer">{t("reference")}</a></li><li>{t("soil")}: {result.source.soil} {result.source.root} <a href={soilReference.fao56TypicalValues.sourceUrl} target="_blank" rel="noreferrer">FAO-56 Table 19</a> · <a href="https://www.fao.org/4/X0490E/x0490e0e.htm" target="_blank" rel="noreferrer">FAO-56 Table 22</a></li><li>{t("method")}: {method} · {result.source.method}</li></ul></details>
          {result.weatherMode === "live" && result.forecastRainfallMm !== undefined && <div className="rainfall-forecast-scenario"><strong>{t("forecastScenario")}</strong><span>{t("forecastPrecipitation")} {fmtLiters(result.forecastRainfallMm)} mm{result.forecastRainfallDate ? ` · ${result.forecastRainfallDate}` : ""}. {t("forecastNotDeducted")}</span></div>}
          <details><summary>{t("calculationLimits")}</summary><ul>{[t("historicalLimit"), t("rainLimit"), t("typicalLimit"), t("riceLimit")].map(note => <li key={note}>{note}</li>)}</ul></details>
        </section>}
      </section>
    </>}
      <section className="panel irrigation-reports">
        <div className="section-heading"><div><p className="eyebrow">{t("completedOnly")}</p><h2>{t("waterConsumption")}</h2><p className="muted">{t("totalsExclude")}</p></div><div className="irrigation-total"><span>{t("totalApplied")}</span><strong>{fmtLiters(reports.totalLiters)} <small>L</small></strong><small>{reports.completedCount} transaction{reports.completedCount === 1 ? "" : "s"}</small></div></div>
        <div className="irrigation-report-grid"><section className="irrigation-report-table"><h3>{t("byCrop")}</h3>{reports.byCrop.length ? <table><thead><tr><th>{t("crop")}</th><th>{t("events")}</th><th>{t("waterApplied")}</th></tr></thead><tbody>{reports.byCrop.map(item => <tr key={item.crop}><td>{item.crop}</td><td>{item.count}</td><td>{fmtLiters(item.liters)} L</td></tr>)}</tbody></table> : <p className="muted">{t("noCompletedYet")}</p>}</section><section className="irrigation-report-table"><h3>{t("byMonth")}</h3>{reports.byMonth.length ? <table><thead><tr><th>{t("month")}</th><th>{t("events")}</th><th>{t("waterApplied")}</th></tr></thead><tbody>{reports.byMonth.map(item => <tr key={item.month}><td>{item.label}</td><td>{item.count}</td><td>{fmtLiters(item.liters)} L</td></tr>)}</tbody></table> : <p className="muted">{t("monthlyEmpty")}</p>}</section></div>
      </section>
      <section className="panel simple-irrigation-card" id="record-watering"><h2>{editingRecordId ? t("editTransaction") : t("recordCompleted")}</h2>{recordCycles.length ? <form className="simple-planner-form" onSubmit={recordWater}>
        {editingRecord ? <div className="watering-edit-cycle"><span>{t("cropField")}</span><strong>{editingRecord.crop} · {editingRecord.field}</strong><small>{t("cycleUnchanged")}</small></div> : <label className="field"><span>{t("cropField")}</span><select value={recordCycleId} onChange={event => setRecordCycleId(event.target.value)}>{recordCycles.map(item => <option key={item.id} value={item.id}>{item.crop} · {item.farm} / {item.field}</option>)}</select></label>}
        <label className="field"><span>{t("date")}</span><input type="date" name="irrigationDate" max={today()} value={recordDate} onChange={event => setRecordDate(event.target.value)} required/></label>
        <label className="field"><span>{t("quantityLitres")}</span><input type="number" name="waterAppliedLiters" min="0.01" max="100000000" step="0.01" value={recordLiters} onChange={event => setRecordLiters(event.target.value)} required/></label>
          <label className="field"><span>{t("methodUsed")}</span><select value={method} onChange={event => setMethod(event.target.value)}>{plannerConfig.methods.map(item => <option key={item}>{item}</option>)}</select><small>{t("sharedMethod")}</small></label>
        <label className="field"><span>{t("notesOptional")}</span><input name="notes" maxLength={500} value={recordNotes} onChange={event => setRecordNotes(event.target.value)}/></label><div className="watering-form-actions"><button className="btn" disabled={busy || recordInFlight.current}>{busy ? t("saving") : editingRecordId ? t("saveChanges") : t("saveWatering")}</button>{editingRecordId && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setEditingRecordId(null); setRecordDate(today()); setRecordLiters(""); setRecordNotes(""); }}>{t("cancelEdit")}</button>}</div>
      </form> : <p className="muted">{t("addCycleToRecord")}</p>}</section>
    <section className="panel simple-schedule-list" id="irrigation-history">
      <div className="section-heading"><div><p className="eyebrow">{t("savedRecords")}</p><h2>{t("historyTitle")}</h2><p className="muted">{t("historySubtitle")}</p></div></div>
      <div className="history-group"><div className="history-group-heading"><div><h3>{t("completedWatering")}</h3><p>{t("actualWatering")}</p></div><span>{completedRows.length} {t("records")}</span></div>
      {completedRows.length ? <div className="simple-history-table-wrap"><table className="watering-history-table"><thead><tr><th>{t("date")}</th><th>{t("crop")}</th><th>{t("field")}</th><th>{t("quantity")}</th><th>{t("methodTable")}</th><th>{t("notesOptional")}</th><th>{t("actions")}</th></tr></thead><tbody>{completedRows.map(item => <tr key={item.id}><td data-label={t("date")}>{item.date}</td><td data-label={t("crop")}>{item.crop}</td><td data-label={t("field")}>{item.field}</td><td data-label={t("quantity")}><strong>{fmtLiters(item.actualLiters ?? 0)} L</strong></td><td data-label={t("methodTable")}>{item.method ?? "—"}</td><td data-label={t("notesOptional")}>{item.note || "—"}</td><td data-label={t("actions")}><div className="history-row-actions"><button type="button" className="btn btn-secondary" disabled={busy || deletingRecordId !== null} onClick={() => editWateringRecord(item)}>{t("edit")}</button><button type="button" className="btn btn-danger" disabled={busy || deletingRecordId !== null} onClick={() => void deleteWateringRecord(item)}>{deletingRecordId === item.id ? t("deleting") : t("delete")}</button></div></td></tr>)}</tbody></table></div> : <p className="muted history-empty">{t("noCompletedTransactions")}</p>}</div>
      <div className="history-group planned-history-group"><div className="history-group-heading"><div><h3>{t("plannedChecks")}</h3><p>{t("reminderOnly")}</p></div><span>{plannedRows.length} {t("reminders")}</span></div>
      {plannedRows.length ? <div className="simple-history-table-wrap"><table className="watering-history-table planned-history-table"><thead><tr><th>{t("checkDate")}</th><th>{t("crop")}</th><th>{t("field")}</th><th>{t("reminder")}</th><th>{t("actions")}</th></tr></thead><tbody>{plannedRows.map(item => <tr key={item.id}><td data-label={t("checkDate")}>{item.date}</td><td data-label={t("crop")}>{item.crop}</td><td data-label={t("field")}>{item.field}</td><td data-label={t("reminder")}>{item.note}</td><td data-label={t("actions")}>{item.isCheckOnly && <button type="button" className="btn btn-danger" disabled={busy || deletingRecordId !== null} onClick={() => void deletePlannedCheck(item)}>{deletingRecordId === item.id ? t("deleting") : t("delete")}</button>}</td></tr>)}</tbody></table></div> : <p className="muted history-empty">{t("noReminders")}</p>}</div>
    </section>
  </div>;
}

function matchSoil(value?: string | null) { const v = value?.toLowerCase() ?? ""; if (!v) return "Loamy Soil"; return soils.find(item => item.toLowerCase() === v || item.toLowerCase().includes(v) || v.includes(item.toLowerCase().replace(" soil", ""))) ?? "Loamy Soil"; }
function matchStage(value?: string | null) { return plannerConfig.stages.find(item => item.toLowerCase() === value?.toLowerCase()) ?? "Vegetative"; }
function matchMethod(value?: string | null) { const v = value?.toLowerCase() ?? ""; return plannerConfig.methods.find(item => item.toLowerCase().startsWith(v)) ?? "Drip Irrigation"; }
