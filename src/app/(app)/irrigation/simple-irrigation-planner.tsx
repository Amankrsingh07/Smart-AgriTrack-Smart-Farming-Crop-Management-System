"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FarmerAdviceCard from "../farmer-advice-card";
import { useLocale, useTranslations } from "next-intl";
import plannerConfig from "@/data/irrigation/simple-planner.json";
import soilReference from "@/data/irrigation/soil_reference.json";
import cropWater from "@/data/irrigation/crop_water_parameters.json";
import { cropAdviceLabel } from "@/i18n/crop-advice";
import { irrigationSoils, matchIrrigationSoil } from "@/lib/irrigation-soils";
import {
  calculateSimpleIrrigation,
  normalizeCropName,
  matchIrrigationStage,
  matchIrrigationMethod,
} from "@/lib/simple-irrigation-planner";

export type PlannerCycle = {
  id: string;
  crop: string;
  stage: string | null;
  status: string;
  farm: string;
  field: string;
  state: string;
  district: string;
  area: number;
  areaUnit: string;
  soil: string;
  method: string;
};
export type PlannerHistoryRow = {
  id: string;
  cropCycleId: string;
  crop: string;
  field: string;
  date: string;
  completed: boolean;
  status: string;
  method: string | null;
  recommendedLiters: number | null;
  actualLiters: number | null;
  note: string | null;
  isCheckOnly: boolean;
};
export type IrrigationReport = {
  totalLiters: number;
  completedCount: number;
  byCrop: Array<{ crop: string; liters: number; count: number }>;
  byMonth: Array<{
    month: string;
    label: string;
    liters: number;
    count: number;
  }>;
};
type PlannerResult = ReturnType<typeof calculateSimpleIrrigation>;
type DisplayResult = PlannerResult & {
  manualRainfallScenarioMm?: number;
};

const fmtLiters = (value: number) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const formatRange = (
  min: number | undefined,
  max: number | undefined,
  digits = 2,
) =>
  min === undefined || max === undefined
    ? "—"
    : min === max
      ? min.toFixed(digits)
      : `${min.toFixed(digits)}–${max.toFixed(digits)}`;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export default function SimpleIrrigationPlanner({
  cycles,
  recordCycles,
  history,
  reports,
  initialCycleId,
}: {
  initialCycleId?: string;
  cycles: PlannerCycle[];
  recordCycles: PlannerCycle[];
  history: PlannerHistoryRow[];
  reports: IrrigationReport;
}) {
  const router = useRouter();
  const t = useTranslations("Irrigation");
  const locale = useLocale();
  const say = (en: string, hi: string) => (locale === "hi" ? hi : en);
  const [progress, setProgress] = useState("");
  const initialCycle =
    cycles.find((item) => item.id === initialCycleId) ?? cycles[0];
  const [cycleId, setCycleId] = useState(initialCycle?.id ?? "");
  const cycle = useMemo(
    () => cycles.find((item) => item.id === cycleId),
    [cycles, cycleId],
  );
  const isPaddy = !!cycle && normalizeCropName(cycle.crop) === "rice";
  const [soil, setSoil] = useState(() =>
    matchIrrigationSoil(initialCycle?.soil),
  );
  const rootReference = cropWater.crops.find(
    (row) =>
      normalizeCropName(row.crop) === normalizeCropName(cycle?.crop ?? ""),
  )?.rootDepthRangeM;
  const soilTypical = soilReference.soils.find((row) => row.soil === soil);
  const soilSourceUrl =
    soilTypical?.sourceUrl ?? soilReference.fao56TypicalValues.sourceUrl;
  const soilSourceLabel = soilTypical?.sourceLabel ?? "FAO-56 Table 19";
  const soilReferenceHint = (value?: number) =>
    value === undefined ? (
      say(
        "Choose the field’s soil texture or enter a measured value.",
        "खेत की मिट्टी की बनावट चुनें या मापा हुआ मान भरें।",
      )
    ) : (
      <>
        <a href={soilSourceUrl} target="_blank" rel="noreferrer">
          {soilTypical?.sourceLabel ?? t("typicalValue")}
        </a>{" "}
        {value}%
      </>
    );

  const [stage, setStage] = useState(() =>
    matchIrrigationStage(initialCycle?.stage),
  );
  const [method, setMethod] = useState(() =>
    matchIrrigationMethod(initialCycle?.method),
  );
  const [weatherMode, setWeatherMode] = useState<"offline" | "online">(
    "offline",
  );
  const [calculationDate, setCalculationDate] = useState(today);
  const [moistureMeasuredDate, setMoistureMeasuredDate] = useState(today);
  const [rainfallMm, setRainfallMm] = useState("");
  const [fieldCapacityPercent, setFieldCapacityPercent] = useState("");
  const [wiltingPointPercent, setWiltingPointPercent] = useState("");
  const [currentMoisturePercent, setCurrentMoisturePercent] = useState("");
  const [rootZoneDepthM, setRootZoneDepthM] = useState("");
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recordCycleId, setRecordCycleId] = useState(
    recordCycles.find((item) => item.id === initialCycleId)?.id ??
      recordCycles[0]?.id ??
      "",
  );
  const [recordDate, setRecordDate] = useState(today);
  const [recordLiters, setRecordLiters] = useState("");
  const [recordNotes, setRecordNotes] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null);
  const transactionId = useRef<string | null>(null);
  const recordInFlight = useRef(false);
  const planRevision = useRef(0);

  function changeCycle(id: string) {
    const next = cycles.find((item) => item.id === id);
    const nextSoil = matchIrrigationSoil(next?.soil);
    setCycleId(id);
    setRecordCycleId(id);
    setSoil(nextSoil);
    setStage(matchIrrigationStage(next?.stage));
    setMethod(matchIrrigationMethod(next?.method));
    setFieldCapacityPercent("");
    setWiltingPointPercent("");
    setRootZoneDepthM("");
    setCurrentMoisturePercent("");

    setProgress("");
    setMoistureMeasuredDate(today());
    setRainfallMm("");
    clearPlan();
  }
  function clearPlan() {
    planRevision.current += 1;
    setResult(null);
    setMessage("");
  }
  async function sendPlanner(save: boolean) {
    if (!cycle || (save && !result?.canSaveReminder)) return;
    const revision = planRevision.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const optionalNumber = (value: string) =>
        value === "" ? undefined : Number(value);
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
          cropCycleId: cycle.id,
          mode: "measured",
          developmentProgressPercent: optionalNumber(progress),
          soil,
          growthStage: stage,
          method,
          weatherMode: weatherMode === "online" ? "live" : "offline",
          calculationDate,
          moistureMeasuredDate,
          moisture,
          manualRainfallScenarioMm: isPaddy
            ? undefined
            : optionalNumber(rainfallMm),
          save,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success)
        throw new Error(
          payload.error || "The planner could not complete the request.",
        );
      if (revision !== planRevision.current) {
        if (save) router.refresh();
        return;
      }
      const nextResult = payload.data as DisplayResult;
      setResult(nextResult);
      const exactGrossAmount =
        nextResult.grossRequirementLitersMin !== undefined &&
        nextResult.grossRequirementLitersMin ===
          nextResult.grossRequirementLitersMax
          ? nextResult.grossRequirementLitersMin
          : undefined;
      if (
        nextResult.mode === "measured" &&
        !nextResult.paddy &&
        nextResult.available &&
        nextResult.irrigationDue &&
        exactGrossAmount !== undefined
      )
        setRecordLiters(exactGrossAmount.toFixed(2));
      else setRecordLiters("");
      if (save) {
        setMessage(
          `${payload.duplicate ? t("duplicateReminder") : t("savedReminder")} ${payload.scheduledAt}.`,
        );
        router.refresh();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The planner could not complete the request.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function recordWater(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recordInFlight.current) return;
    recordInFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const editing = editingRecordId !== null;
      if (!editing) {
        const fingerprint = JSON.stringify([
          recordCycleId,
          recordDate,
          Number(recordLiters),
          method,
          recordNotes.trim(),
          checkId,
        ]);
        const storageKey = "agritrack-irrigation-pending-transaction";
        try {
          const pending = sessionStorage.getItem(storageKey);
          const parsed = pending
            ? (JSON.parse(pending) as { fingerprint?: string; id?: string })
            : null;
          transactionId.current =
            parsed?.fingerprint === fingerprint && parsed.id
              ? parsed.id
              : globalThis.crypto.randomUUID();
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({ fingerprint, id: transactionId.current }),
          );
        } catch {
          transactionId.current ??= globalThis.crypto.randomUUID();
        }
      }
      const response = await fetch(
        editing
          ? `/api/irrigation/history/${editingRecordId}`
          : "/api/irrigation/history",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(editing
              ? {}
              : {
                  transactionId: transactionId.current,
                  ...(checkId ? { checkId } : {}),
                }),
            cropCycleId: recordCycleId,
            irrigationDate: recordDate,
            waterAppliedLiters: Number(recordLiters),
            method,
            notes: recordNotes,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload.success)
        throw new Error(t("couldNotSaveWatering"));
      setMessage(
        editing
          ? t("wateringUpdated")
          : payload.duplicate
            ? t("wateringDuplicate")
            : t("wateringSaved"),
      );
      setEditingRecordId(null);
      setCheckId(null);
      transactionId.current = null;
      try {
        sessionStorage.removeItem("agritrack-irrigation-pending-transaction");
      } catch {
        /* Session storage can be unavailable; the server still enforces the transaction key. */
      }
      setRecordDate(today());
      setRecordLiters("");
      setRecordNotes("");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save watering record.",
      );
    } finally {
      recordInFlight.current = false;
      setBusy(false);
    }
  }

  function editWateringRecord(item: PlannerHistoryRow) {
    setCheckId(null);
    setEditingRecordId(item.id);
    setRecordDate(item.date);
    setRecordLiters(String(item.actualLiters ?? ""));
    setMethod(item.method ?? "Drip Irrigation");
    setRecordNotes(item.note ?? "");
    clearPlan();
    setError("");
    setMessage("");
    document
      .getElementById("record-watering")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function deleteWateringRecord(item: PlannerHistoryRow) {
    if (!window.confirm(t("confirmDelete"))) return;
    setDeletingRecordId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/irrigation/history/${item.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success)
        throw new Error(t("couldNotDelete"));
      setMessage(t("rainDeleted"));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("couldNotDelete"));
    } finally {
      setDeletingRecordId(null);
    }
  }

  async function deletePlannedCheck(item: PlannerHistoryRow) {
    if (!window.confirm(t("confirmDeleteReminder"))) return;
    setDeletingRecordId(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/irrigation/history/${item.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success)
        throw new Error(t("couldNotDelete"));
      setMessage(t("reminderDeleted"));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("couldNotDelete"));
    } finally {
      setDeletingRecordId(null);
    }
  }

  const completedRows = history.filter(
    (item) => item.completed && item.actualLiters !== null,
  );
  const editingRecord = completedRows.find(
    (item) => item.id === editingRecordId,
  );
  const plannedRows = history.filter(
    (item) => !item.completed && item.status !== "CANCELLED",
  );

  return (
    <div className="irrigation-page simple-planner-page">
      <header className="irrigation-heading">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p className="muted">{t("subtitle")}</p>
        </div>
      </header>
      {!cycles.length ? (
        <section className="panel">
          <h2>{t("noCrop")}</h2>
          <p className="muted">{t("addCycle")}</p>
          <a className="btn" href="/crops">
            {t("openCrops")}
          </a>
        </section>
      ) : (
        <>
          <section className="panel simple-irrigation-card">
            <h2>{t("planTitle")}</h2>
            <form
              className="simple-planner-form"
              onSubmit={(event) => {
                event.preventDefault();
                void sendPlanner(false);
              }}
            >
              <label className="field">
                <span>{t("cropField")}</span>
                <select
                  value={cycleId}
                  onChange={(event) => changeCycle(event.target.value)}
                >
                  {cycles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.crop} · {item.farm} / {item.field}
                    </option>
                  ))}
                </select>
                {cycle && (
                  <small>
                    {cycle.area} {cycle.areaUnit} · {cycle.district},{" "}
                    {cycle.state}
                  </small>
                )}
              </label>
              <label className="field">
                <span>{t("calculationDate")}</span>
                <input
                  type="date"
                  min={today()}
                  value={calculationDate}
                  onChange={(event) => {
                    setCalculationDate(event.target.value);
                    clearPlan();
                  }}
                />
                <small>{t("calculationDateHint")}</small>
              </label>
              {!isPaddy && (
                <label className="field">
                  <span>{t("moistureMeasuredDate")}</span>
                  <input
                    type="date"
                    max={today()}
                    value={moistureMeasuredDate}
                    onChange={(event) => {
                      setMoistureMeasuredDate(event.target.value);

                      clearPlan();
                    }}
                  />
                  <small>{t("moistureMeasuredDateHint")}</small>
                </label>
              )}
              <label className="field">
                <span>{t("soil")}</span>
                <select
                  value={soil}
                  onChange={(event) => {
                    setSoil(event.target.value);
                    setFieldCapacityPercent("");
                    setWiltingPointPercent("");
                    clearPlan();
                  }}
                >
                  {irrigationSoils.map((item) => (
                    <option key={item} value={item}>
                      {cropAdviceLabel(item, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("stage")}</span>
                <select
                  required
                  value={stage}
                  onChange={(event) => {
                    setStage(event.target.value);
                    clearPlan();
                  }}
                >
                  <option value="">
                    {say("Choose the crop stage", "फसल की अवस्था चुनें")}
                  </option>
                  {plannerConfig.stages.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              {stage === "Vegetative" && (
                <label className="field">
                  <span>
                    {say(
                      "Progress through vegetative growth (%)",
                      "वानस्पतिक वृद्धि की प्रगति (%)",
                    )}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={progress}
                    onChange={(event) => {
                      setProgress(event.target.value);
                      clearPlan();
                    }}
                  />
                  <small>
                    {say(
                      "Enter 0 at the start or 100 at full canopy. Leave blank if unsure.",
                      "शुरुआत में 0 और पूरी छतरी बनने पर 100 भरें। पता न हो तो खाली छोड़ें।",
                    )}
                  </small>
                </label>
              )}
              <label className="field">
                <span>{t("method")}</span>
                <select
                  value={method}
                  required
                  onChange={(event) => {
                    setMethod(event.target.value);
                    clearPlan();
                  }}
                >
                  <option value="">
                    {say(
                      "Choose the irrigation method",
                      "सिंचाई का तरीका चुनें",
                    )}
                  </option>
                  {plannerConfig.methods.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              {!isPaddy && (
                <label className="field">
                  <span>{t("rainfall")}</span>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    value={rainfallMm}
                    onChange={(event) => {
                      setRainfallMm(event.target.value);
                      clearPlan();
                    }}
                  />
                  <small>{t("rainfallHint")}</small>
                </label>
              )}
              <label className="field">
                <span>{t("etoMode")}</span>
                <select
                  value={weatherMode}
                  onChange={(event) => {
                    setWeatherMode(event.target.value as "offline" | "online");
                    clearPlan();
                  }}
                >
                  <option value="offline">{t("offlineDataset")}</option>
                  <option value="online">{t("onlineDataset")}</option>
                </select>
                <small>
                  {weatherMode === "offline"
                    ? t("offlineEtoHint")
                    : t("onlineEtoHint")}
                </small>
              </label>
              <details className="irrigation-soil-inputs" open>
                <summary>{t("soilOverrides")}</summary>
                <div className="irrigation-soil-fields">
                  <p className="muted">
                    {isPaddy
                      ? say(
                          "Soil readings are shown for reference. Flooded rice needs a separate water balance for an irrigation amount.",
                          "मिट्टी की रीडिंग संदर्भ के लिए हैं। खड़े पानी वाले धान की सिंचाई मात्रा के लिए अलग जल संतुलन चाहिए।",
                        )
                      : t("typicalNote")}
                  </p>
                  <label className="field">
                    <span>{t("fieldCapacity")}</span>
                    <input
                      type="number"
                      min="0.1"
                      max="100"
                      step="0.1"
                      placeholder={say("e.g. 29", "जैसे 29")}
                      value={fieldCapacityPercent}
                      onChange={(event) => {
                        setFieldCapacityPercent(event.target.value);
                        clearPlan();
                      }}
                    />
                    <small>
                      {soilReferenceHint(soilTypical?.fieldCapacityPercent)}
                    </small>
                  </label>
                  <label className="field">
                    <span>{t("wiltingPoint")}</span>
                    <input
                      type="number"
                      min="0"
                      max="99.9"
                      step="0.1"
                      placeholder={say("e.g. 13", "जैसे 13")}
                      value={wiltingPointPercent}
                      onChange={(event) => {
                        setWiltingPointPercent(event.target.value);
                        clearPlan();
                      }}
                    />
                    <small>
                      {soilReferenceHint(soilTypical?.wiltingPointPercent)}
                    </small>
                  </label>
                  <label className="field">
                    <span>{t("rootDepth")}</span>
                    <input
                      type="number"
                      min="0.05"
                      max="3"
                      step="0.01"
                      placeholder={say("e.g. 0.6", "जैसे 0.6")}
                      value={rootZoneDepthM}
                      onChange={(event) => {
                        setRootZoneDepthM(event.target.value);
                        clearPlan();
                      }}
                    />
                    <small>
                      <a
                        href={cropWater.meta.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        FAO-56 Table 22
                      </a>{" "}
                      {rootReference?.length
                        ? `${rootReference.join("–")} m`
                        : t("unavailable")}
                    </small>
                  </label>
                  <label className="field">
                    <span>{t("currentMoisture")}</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder={say("e.g. 18", "जैसे 18")}
                      value={currentMoisturePercent}
                      onChange={(event) => {
                        setCurrentMoisturePercent(event.target.value);
                        clearPlan();
                      }}
                    />
                    <small>
                      {isPaddy
                        ? say(
                            "Enter a current measured value for reference.",
                            "संदर्भ के लिए मौजूदा माप भरें।",
                          )
                        : t("currentMoistureHint")}
                    </small>
                  </label>
                </div>
              </details>
              <div className="simple-planner-actions">
                <button className="btn" disabled={busy}>
                  {busy ? t("working") : t("calculate")}
                </button>
                {result?.canSaveReminder && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => void sendPlanner(true)}
                  >
                    {t("saveCheck")}
                  </button>
                )}
              </div>
            </form>
            {error && (
              <p role="alert" className="irrigation-alert">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="irrigation-success">
                {message}
              </p>
            )}
            {result && (
              <section className="simple-planner-result" aria-live="polite">
                <div className="simple-planner-result-heading">
                  <div>
                    <h3>{t("waterBalance")}</h3>
                  </div>
                  {result.available && !result.paddy && (
                    <span
                      className={`planner-decision ${result.irrigationDue ? "due" : "wait"}`}
                    >
                      {result.irrigationDue
                        ? t("thresholdReached")
                        : t("noIrrigationDue")}
                    </span>
                  )}
                </div>
                <div className="planner-demand">
                  <div>
                    <span>{t("dailyEtc")}</span>
                    <strong>
                      {formatRange(
                        result.etcMinMmPerDay,
                        result.etcMaxMmPerDay,
                      )}{" "}
                      mm/day
                    </strong>
                  </div>
                  <p>
                    <b>ETo</b>{" "}
                    {result.et0MmPerDay?.toFixed(2) ?? t("unavailable")} mm/day
                    × <b>Kc</b> {formatRange(result.kcMin, result.kcMax)}
                  </p>
                </div>
                <p>
                  {say("Confidence", "विश्वसनीयता")} ·{" "}
                  {result.available
                    ? (
                        {
                          demonstration: say("Demo only", "केवल प्रदर्शन"),
                          "one-day projection": say(
                            "One-day estimate",
                            "एक दिन का अनुमान",
                          ),
                          "model-based, check the field": say(
                            "Model estimate, check the field",
                            "मॉडल का अनुमान, खेत की जाँच करें",
                          ),
                          "field-input-based": say(
                            "Based on field readings",
                            "खेत की माप पर आधारित",
                          ),
                        } as Record<string, string>
                      )[result.confidence]
                    : say("Insufficient information", "जानकारी अधूरी है")}
                </p>
                {result.paddy && (
                  <p>
                    <a
                      href="https://www.fao.org/4/t7202e/t7202e07.htm"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {say(
                        "FAO flooded rice water balance",
                        "FAO धान जल संतुलन",
                      )}
                    </a>
                  </p>
                )}
                {result.paddyBalance && (
                  <p>
                    {say("Projected standing water", "अनुमानित खड़ा पानी")}{" "}
                    {result.paddyBalance.projectedPondMm.toFixed(1)} mm ·{" "}
                    {say("Bund overflow", "मेड़ से बहाव")}{" "}
                    {result.paddyBalance.overflowMm.toFixed(1)} mm
                  </p>
                )}
                {result.available ? (
                  <>
                    <div className="simple-planner-metrics">
                      {!result.paddy && (
                        <>
                          <article>
                            <span>{t("depletion")}</span>
                            <strong>
                              {result.depletionMm?.toFixed(1)} <small>mm</small>
                            </strong>
                            <small>
                              {result.balanceElapsedDays === 0
                                ? t("measuredBalance")
                                : `${result.balanceElapsedDays} ${t("projectedDays")}`}
                            </small>
                          </article>
                          <article>
                            <span>{t("raw")}</span>
                            <strong>
                              {result.allowableDepletionMm?.toFixed(1)}{" "}
                              <small>mm</small>
                            </strong>
                            <small>{t("thresholdHint")}</small>
                          </article>
                        </>
                      )}
                      <article>
                        <span>{t("netWater")}</span>
                        <strong>
                          {result.netRequirementMm?.toFixed(1)}{" "}
                          <small>mm</small>
                        </strong>
                        <small>
                          {result.paddy
                            ? say("Pond refill", "खड़ा पानी फिर भरना")
                            : t("rootZoneWater")}
                        </small>
                      </article>
                      <article>
                        <span>{t("grossWater")}</span>
                        <strong>
                          {formatRange(
                            result.grossRequirementLitersMin,
                            result.grossRequirementLitersMax,
                            0,
                          )}{" "}
                          <small>L</small>
                        </strong>
                        <small>
                          {formatRange(
                            result.grossRequirementLitersMin === undefined
                              ? undefined
                              : result.grossRequirementLitersMin / 1000,
                            result.grossRequirementLitersMax === undefined
                              ? undefined
                              : result.grossRequirementLitersMax / 1000,
                          )}{" "}
                          kL · {result.source.method}
                        </small>
                      </article>
                    </div>
                    {result.mode === "measured" && !result.paddy && (
                      <FarmerAdviceCard
                        locale={locale}
                        problem={
                          result.irrigationDue
                            ? t("thresholdReached")
                            : t("noIrrigationDue")
                        }
                        reason={
                          result.balanceElapsedDays === 0
                            ? t("measuredBalance")
                            : `${result.balanceElapsedDays} ${t("projectedDays")}`
                        }
                        actions={[
                          result.irrigationDue
                            ? t("irrigationRecommended")
                            : t("noWatering"),
                        ]}
                        details={<p>{t("forecastNotDeducted")}</p>}
                      />
                    )}
                  </>
                ) : (
                  <div className="farmer-advice-card">
                    <h3>{t("waterUnavailable")}</h3>
                    <ul>
                      {result.missing.map((item) => (
                        <li key={item}>
                          {result.weatherMode === "live" &&
                          item.includes("Live weather")
                            ? t("onlineEtoUnavailable")
                            : item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="rainfall-balance-strip">
                  <article>
                    <span>{t("grossRainfall")}</span>
                    <strong>
                      {result.grossRainfallMm === undefined
                        ? t("unavailable")
                        : `${fmtLiters(result.grossRainfallMm)} mm`}
                    </strong>
                  </article>
                  {(!result.paddy || result.paddyBalance) && (
                    <article>
                      <span>{t("effectiveRainfall")}</span>
                      <strong>
                        {result.effectiveRainfallMm === undefined
                          ? t("unavailable")
                          : `${fmtLiters(result.effectiveRainfallMm)} mm`}
                      </strong>
                    </article>
                  )}
                  <p>
                    <b>{t("source")}</b> {result.rainfallNote}
                    {result.manualRainfallScenarioMm !== undefined
                      ? ` Manual rainfall entered: ${fmtLiters(result.manualRainfallScenarioMm)} mm; not credited.`
                      : ""}
                  </p>
                </div>
                <details>
                  <summary>{t("parameterSources")}</summary>
                  <dl className="irrigation-parameter-sources">
                    <div>
                      <dt>ETo</dt>
                      <dd>
                        {result.et0MmPerDay === undefined
                          ? t("unavailable")
                          : `${result.et0MmPerDay.toFixed(2)} mm/day`}
                        {" · "}
                        {result.source.climate} {result.source.climateLocation}{" "}
                        {result.weatherRetrievedAt && (
                          <>
                            {t("retrievedAt")}{" "}
                            <time dateTime={result.weatherRetrievedAt}>
                              {new Date(
                                result.weatherRetrievedAt,
                              ).toLocaleString(locale, {
                                timeZone: "Asia/Kolkata",
                              })}
                            </time>{" "}
                          </>
                        )}
                        {result.source.climateSourceUrl && (
                          <a
                            href={result.source.climateSourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t("reference")}
                          </a>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Kc</dt>
                      <dd>
                        {result.kcMin === undefined
                          ? t("unavailable")
                          : formatRange(result.kcMin, result.kcMax)}
                        {" · "}
                        {cycle && cropAdviceLabel(cycle.crop, locale)}
                        {" · "}
                        {cropAdviceLabel(stage, locale)}
                        {result.source.crop && (
                          <>
                            {" · "}
                            {result.source.crop}{" "}
                            <a
                              href={result.source.cropUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("reference")}
                            </a>
                          </>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("soil")}</dt>
                      <dd>
                        {cropAdviceLabel(soil, locale)}
                        {" · "}
                        {result.source.soil || t("unavailable")}
                        {(result.estimatedSoil?.typicalTexture ||
                          soilTypical?.fieldCapacityPercent !== undefined) && (
                          <>
                            {" "}
                            <a
                              href={soilSourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {soilSourceLabel}
                            </a>
                          </>
                        )}
                      </dd>
                    </div>
                    {result.estimatedSoil && (
                      <div>
                        <dt>
                          {say(
                            "Soil values used",
                            "इस्तेमाल किए गए मिट्टी के मान",
                          )}
                        </dt>
                        <dd>
                          FC {result.estimatedSoil.fieldCapacityPercent}% · WP{" "}
                          {result.estimatedSoil.wiltingPointPercent}% (
                          {result.estimatedSoil.typicalTexture
                            ? say("texture references", "बनावट संदर्भ")
                            : say("field inputs", "खेत से दर्ज मान")}
                          ) · {result.estimatedSoil.rootDepthM} m (
                          {result.estimatedSoil.referenceDepth
                            ? say(
                                "FAO root-depth reference",
                                "FAO जड़ गहराई संदर्भ",
                              )
                            : say("entered root depth", "दर्ज जड़ गहराई")}
                          )
                        </dd>
                      </div>
                    )}
                    {result.source.root && (
                      <div>
                        <dt>{t("rootDepth")}</dt>
                        <dd>
                          {result.source.root}{" "}
                          <a
                            href="https://www.fao.org/4/X0490E/x0490e0e.htm"
                            target="_blank"
                            rel="noreferrer"
                          >
                            FAO-56 Table 22
                          </a>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>{t("method")}</dt>
                      <dd>
                        {method}
                        {" · "}
                        {result.source.method || t("unavailable")}
                      </dd>
                    </div>
                  </dl>
                </details>
                {result.mode === "measured" &&
                  !result.paddy &&
                  result.weatherMode === "live" &&
                  result.forecastRainfallMm !== undefined && (
                    <div className="rainfall-forecast-scenario">
                      <strong>{t("forecastScenario")}</strong>
                      <span>
                        {t("forecastPrecipitation")}{" "}
                        {fmtLiters(result.forecastRainfallMm)} mm
                        {result.forecastRainfallDate
                          ? ` · ${result.forecastRainfallDate}`
                          : ""}
                        . {t("forecastNotDeducted")}
                      </span>
                    </div>
                  )}
                <details>
                  <summary>{t("calculationLimits")}</summary>
                  <ul>
                    {(result.mode === "measured" && !result.paddy
                      ? [
                          t("historicalLimit"),
                          t("rainLimit"),
                          t("typicalLimit"),
                        ]
                      : result.notes
                    ).map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </details>
              </section>
            )}
          </section>
        </>
      )}
      <section className="panel irrigation-reports">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("completedOnly")}</p>
            <h2>{t("waterConsumption")}</h2>
            <p className="muted">{t("totalsExclude")}</p>
          </div>
          <div className="irrigation-total">
            <span>{t("totalApplied")}</span>
            <strong>
              {fmtLiters(reports.totalLiters)} <small>L</small>
            </strong>
            <small>
              {reports.completedCount} transaction
              {reports.completedCount === 1 ? "" : "s"}
            </small>
          </div>
        </div>
        <div className="irrigation-report-grid">
          <section className="irrigation-report-table">
            <h3>{t("byCrop")}</h3>
            {reports.byCrop.length ? (
              <table>
                <thead>
                  <tr>
                    <th>{t("crop")}</th>
                    <th>{t("events")}</th>
                    <th>{t("waterApplied")}</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.byCrop.map((item) => (
                    <tr key={item.crop}>
                      <td>{item.crop}</td>
                      <td>{item.count}</td>
                      <td>{fmtLiters(item.liters)} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">{t("noCompletedYet")}</p>
            )}
          </section>
          <section className="irrigation-report-table">
            <h3>{t("byMonth")}</h3>
            {reports.byMonth.length ? (
              <table>
                <thead>
                  <tr>
                    <th>{t("month")}</th>
                    <th>{t("events")}</th>
                    <th>{t("waterApplied")}</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.byMonth.map((item) => (
                    <tr key={item.month}>
                      <td>{item.label}</td>
                      <td>{item.count}</td>
                      <td>{fmtLiters(item.liters)} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">{t("monthlyEmpty")}</p>
            )}
          </section>
        </div>
      </section>
      <section className="panel simple-irrigation-card" id="record-watering">
        <h2>{editingRecordId ? t("editTransaction") : t("recordCompleted")}</h2>
        {recordCycles.length ? (
          <form className="simple-planner-form" onSubmit={recordWater}>
            {editingRecord ? (
              <div className="watering-edit-cycle">
                <span>{t("cropField")}</span>
                <strong>
                  {editingRecord.crop} · {editingRecord.field}
                </strong>
                <small>{t("cycleUnchanged")}</small>
              </div>
            ) : (
              <label className="field">
                <span>{t("cropField")}</span>
                <select
                  value={recordCycleId}
                  onChange={(event) => {
                    setRecordCycleId(event.target.value);
                    setCheckId(null);
                  }}
                >
                  {recordCycles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.crop} · {item.farm} / {item.field}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>{t("date")}</span>
              <input
                type="date"
                name="irrigationDate"
                max={today()}
                value={recordDate}
                onChange={(event) => setRecordDate(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>{t("quantityLitres")}</span>
              <input
                type="number"
                name="waterAppliedLiters"
                min="0.01"
                max="100000000"
                step="0.01"
                value={recordLiters}
                onChange={(event) => setRecordLiters(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>{t("methodUsed")}</span>
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                {plannerConfig.methods.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <small>{t("sharedMethod")}</small>
            </label>
            <label className="field">
              <span>{t("notesOptional")}</span>
              <input
                name="notes"
                maxLength={500}
                value={recordNotes}
                onChange={(event) => setRecordNotes(event.target.value)}
              />
            </label>
            <div className="watering-form-actions">
              <button className="btn" disabled={busy || recordInFlight.current}>
                {busy
                  ? t("saving")
                  : editingRecordId
                    ? t("saveChanges")
                    : t("saveWatering")}
              </button>
              {(editingRecordId || checkId) && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    setCheckId(null);
                    setEditingRecordId(null);
                    setRecordDate(today());
                    setRecordLiters("");
                    setRecordNotes("");
                  }}
                >
                  {t("cancelEdit")}
                </button>
              )}
            </div>
          </form>
        ) : (
          <p className="muted">{t("addCycleToRecord")}</p>
        )}
      </section>
      <section className="panel simple-schedule-list" id="irrigation-history">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t("savedRecords")}</p>
            <h2>{t("historyTitle")}</h2>
            <p className="muted">{t("historySubtitle")}</p>
          </div>
        </div>
        <div className="history-group">
          <div className="history-group-heading">
            <div>
              <h3>{t("completedWatering")}</h3>
              <p>{t("actualWatering")}</p>
            </div>
            <span>
              {completedRows.length} {t("records")}
            </span>
          </div>
          {completedRows.length ? (
            <div className="simple-history-table-wrap">
              <table className="watering-history-table">
                <thead>
                  <tr>
                    <th>{t("date")}</th>
                    <th>{t("crop")}</th>
                    <th>{t("field")}</th>
                    <th>{t("quantity")}</th>
                    <th>{t("methodTable")}</th>
                    <th>{t("notesOptional")}</th>
                    <th>{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {completedRows.map((item) => (
                    <tr key={item.id}>
                      <td data-label={t("date")}>{item.date}</td>
                      <td data-label={t("crop")}>{item.crop}</td>
                      <td data-label={t("field")}>{item.field}</td>
                      <td data-label={t("quantity")}>
                        <strong>{fmtLiters(item.actualLiters ?? 0)} L</strong>
                      </td>
                      <td data-label={t("methodTable")}>
                        {item.method ?? "—"}
                      </td>
                      <td data-label={t("notesOptional")}>
                        {item.note || "—"}
                      </td>
                      <td data-label={t("actions")}>
                        <div className="history-row-actions">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy || deletingRecordId !== null}
                            onClick={() => editWateringRecord(item)}
                          >
                            {t("edit")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={busy || deletingRecordId !== null}
                            onClick={() => void deleteWateringRecord(item)}
                          >
                            {deletingRecordId === item.id
                              ? t("deleting")
                              : t("delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted history-empty">
              {t("noCompletedTransactions")}
            </p>
          )}
        </div>
        <div className="history-group planned-history-group">
          <div className="history-group-heading">
            <div>
              <h3>{t("plannedChecks")}</h3>
              <p>{t("reminderOnly")}</p>
            </div>
            <span>
              {plannedRows.length} {t("reminders")}
            </span>
          </div>
          {plannedRows.length ? (
            <div className="simple-history-table-wrap">
              <table className="watering-history-table planned-history-table">
                <thead>
                  <tr>
                    <th>{t("checkDate")}</th>
                    <th>{t("crop")}</th>
                    <th>{t("field")}</th>
                    <th>{t("reminder")}</th>
                    <th>{t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plannedRows.map((item) => (
                    <tr key={item.id}>
                      <td data-label={t("checkDate")}>{item.date}</td>
                      <td data-label={t("crop")}>{item.crop}</td>
                      <td data-label={t("field")}>{item.field}</td>
                      <td data-label={t("reminder")}>{item.note}</td>
                      <td data-label={t("actions")}>
                        {item.isCheckOnly && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            aria-pressed={checkId === item.id}
                            disabled={busy}
                            onClick={() => {
                              setEditingRecordId(null);
                              setCheckId(item.id);
                              setRecordCycleId(item.cropCycleId);
                              setRecordLiters("");
                              setRecordDate(today());
                              setRecordNotes("");
                              setMessage("");
                              setError("");
                              document
                                .getElementById("record-watering")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                            }}
                          >
                            {t("recordCompleted")}
                          </button>
                        )}
                        {item.isCheckOnly && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={busy || deletingRecordId !== null}
                            onClick={() => void deletePlannedCheck(item)}
                          >
                            {deletingRecordId === item.id
                              ? t("deleting")
                              : t("delete")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted history-empty">{t("noReminders")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
