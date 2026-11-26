"use client";
import {
  farmerAdviceLabels,
  farmerStorageUrgency,
} from "@/i18n/farmer-advice-labels";
import { useLocale, useTranslations } from "next-intl";
import { useProtectionText } from "@/i18n/crop-protection/client";
import { ProtectionLanguage } from "@/i18n/crop-protection/client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { valuationIssues, formatLossMoney } from "@/lib/crop-loss-valuation";
import {
  actionSections,
  harvestDashboard,
  type LossAction,
  type LossRisk,
} from "@/lib/crop-loss-dashboard";
import {
  harvestRiskDetails,
  harvestRiskSections,
  type HarvestRisk,
} from "@/lib/crop-loss-risk";
import { RiskGrid } from "./risk-details";
import { cropAdviceLabel } from "@/i18n/crop-advice";
import { displayLabel } from "@/i18n/display-labels";
import {
  cropPhReference,
  storageRisk,
  emptyInspection,
  storageReferenceVersion,
  type SavedInspection,
} from "@/lib/crop-loss-storage";
import { StorageReadout } from "./storage-readout";
import { StorageInspectionForm } from "./storage-inspection";
import type { deficientSoilReadings } from "@/lib/crop-loss-prevention";
import {
  allocationMatches,
  resolveHarvestLot,
  type lossMetrics,
  type LossMetricInput,
} from "@/lib/crop-loss";
import {
  aggregateLossReport,
  compareExpectedActual,
  preventionProgress,
} from "@/lib/crop-loss-reports";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
type Allocation = {
  revisions?: Omit<Allocation, "revisions">[];
  version: number;
  assessedDate: string;
  marketable: string;
  damaged: string;
  wasted: string;
  evidence: string;
  pricePerUnit: string | null;
  damagedRecovery: string | null;
  priceEvidence: string | null;
  priceConfirmed: boolean;
  cause: string;
  notes: string | null;
};
type Lot = {
  storageInspections: SavedInspection[];
  id: string;
  harvestedLotId: string;
  cropCycleId: string;
  cropId: string;
  farmId: string;
  fieldId: string;
  crop: string;
  field: string;
  farmName: string;
  fieldName: string;
  storageDetails?: string | null;
  stage: string | null;
  metrics: ReturnType<typeof lossMetrics> | null;
  metricInput: LossMetricInput | null;
  harvestDate: string;
  harvested: string;
  sold: string;
  unit: string;
  assessment: Allocation | null;
};
type Group = {
  key: string;
  label: string;
  unit: string;
  harvested: string;
  affected: string;
  lossPercent: string | null;
  monetaryLoss: string | null;
  valuationIssues: { message: string }[];
};
export type Reminder = {
  id: string;
  title: string;
  message: string;
  cropName: string | null;
  productionId: string | null;
  dueOn: string | null;
  priority: string | null;
  completedAt: string | null;
};
function reminderTextParts(message: string) {
  const end = message.search(/[.!?](?:\s|$)/);
  return end < 0
    ? { summary: message, details: "" }
    : {
        summary: message.slice(0, end + 1),
        details: message.slice(end + 1).trim(),
      };
}
type Prevention = {
  deficiencies?: ReturnType<typeof deficientSoilReadings>;
  sampleDate?: string;
  dashboard: {
    risks: LossRisk[];
    actions: LossAction[];
    mode: "ai" | "offline";
    riskDetails?: HarvestRisk[];
    photoReport?: string | null;
    storageRisks?: ReturnType<typeof storageRisk>;
    storageRiskLotId?: string;
    storageRiskInspectionVersion?: number;
    storageWording?: {
      mode: "ai" | "offline";
      actions: { id: string; text: string; short: string }[];
    } | null;
  };
  reminders?: Reminder[];
  weatherStatus: string;
  weatherSource?: "Live API" | "Cached" | "Offline";
  weatherFetchedAt?: string | null;
  currentWeather?: {
    temperature: number | null;
    humidity: number | null;
  } | null;
  weatherIssue: { code: string; message: string; action: string } | null;
  forecastPreview: {
    date: string;
    rainMm: number | null;
    rainProbability: number | null;
    minC: number | null;
    maxC: number | null;
  }[];
  soilStatus: string;
  soilDetails: { issues: { code: string; message: string }[] };
  stageGuidance: {
    title: string;
    actions?: string[];
    guidance?: string[];
    message?: string;
    sourceUrl?: string;
  } | null;
  alerts: {
    code: string;
    message: string;
    sourceUrl: string;
    uncertainty: string;
  }[];
  advice: { summary: string; drainage: string; nutrientPlan: string };
  history?: {
    harvestDate: string;
    crop: string;
    cause: string;
    damaged: string;
    wasted: string;
    unit: string;
  }[];
  officialSources: {
    title: string;
    url: string;
    note?: string;
    bulletins?: { url: string; label: string; dateEvidence: string }[];
  }[];
  limitations: string;
};
const blank = () => ({
  assessedDate: new Date().toISOString().slice(0, 10),
  marketable: "",
  damaged: "",
  wasted: "",
  evidence: "",
  pricePerUnit: "",
  damagedRecovery: "",
  priceEvidence: "",
  priceConfirmed: false,
  cause: "Unknown",
  notes: "",
});
const allocationForm = (assessment: Allocation) => ({
  marketable: assessment.marketable,
  damaged: assessment.damaged,
  wasted: assessment.wasted,
  evidence: assessment.evidence,
  cause: assessment.cause,
  priceConfirmed: assessment.priceConfirmed,
  assessedDate: assessment.assessedDate.slice(0, 10),
  pricePerUnit: assessment.pricePerUnit ?? "",
  damagedRecovery: assessment.damagedRecovery ?? "",
  priceEvidence: assessment.priceEvidence ?? "",
  notes: assessment.notes ?? "",
});
export default function LossWorkspace({
  cycles,
  initialCycle,
  initialLot,
  initialReminders,
}: {
  cycles: {
    id: string;
    farmId: string;
    label: string;
    crop: string;
    stage: string | null;
    soilType: string;
    soilTexture: string | null;
    expectedHarvestQuantity: string | null;
    expectedHarvestUnit: string | null;
    activitiesTotal: number;
    activitiesCompleted: number;
    followUpsTotal: number;
    followUpsCompleted: number;
  }[];
  initialCycle: string;
  initialLot: string;
  initialReminders: Reminder[];
}) {
  const locale = useLocale();
  const farmLabels = useTranslations("Farms");
  const soilLabels = useTranslations("Fertilizer");
  const protectionText = useProtectionText();
  const [lots, setLots] = useState<Lot[]>([]);
  const [groups, setGroups] = useState<Record<string, Group[]>>({});
  const [selected, setSelected] = useState("");
  const [cycle, setCycle] = useState(
    cycles.some((c) => c.id === initialCycle)
      ? initialCycle
      : (cycles[0]?.id ?? ""),
  );
  const [form, setForm] = useState(blank);
  const [confirmed, setConfirmed] = useState(false);
  const [dimension, setDimension] = useState("year");
  const [error, setError] = useState("");
  const [message, setMessage] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [prevention, setPrevention] = useState<Prevention | null>(null);
  const [reminders, setReminders] = useState(initialReminders);
  const [loading, setLoading] = useState(true);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const requestSequence = useRef(0);
  const [editOpen, setEditOpen] = useState(false);
  const [harvestTotal, setHarvestTotal] = useState("");
  const [farmFilter, setFarmFilter] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");
  const [cropFilter, setCropFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expectedInput, setExpectedInput] = useState("");
  const [expectedUnitInput, setExpectedUnitInput] = useState("");
  const [expectedBusy, setExpectedBusy] = useState(false);
  const [expectedMessage, setExpectedMessage] = useState("");
  const [savedTargets, setSavedTargets] = useState<
    Record<string, { quantity: string; unit: string }>
  >({});
  const analysis = useRef<HTMLDetailsElement>(null);
  const sources = useRef<HTMLDetailsElement>(null);
  async function load() {
    const r = await fetch("/api/crop-loss");
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setLots(d.items);
    setGroups(d.analytics);
    return d.items as Lot[];
  }
  useEffect(() => {
    load()
      .then((items) => {
        setHistoryAvailable(true);
        const initial = resolveHarvestLot(items, initialCycle, initialLot);
        if (initial) {
          setSelected(initial.id);
          setForm(
            initial.assessment ? allocationForm(initial.assessment) : blank(),
          );
          setHarvestTotal(initial.harvested);
        }
        if (
          items[0] &&
          cycles.some((item) => item.id === items[0].cropCycleId) &&
          !cycles.some((item) => item.id === initialCycle)
        )
          setCycle(items[0].cropCycleId);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "History unavailable"),
      )
      .finally(() => setLoading(false));
  }, [cycles, initialCycle, initialLot]);
  useEffect(() => {
    const refreshForCycle = (cropCycleId?: string) => {
      if (cropCycleId && cropCycleId !== cycle) return;
      load().catch((e) =>
        setError(e instanceof Error ? e.message : "History unavailable"),
      );
    };
    const onSameTab = (event: Event) =>
      refreshForCycle(
        (event as CustomEvent<{ cropCycleId?: string }>).detail?.cropCycleId,
      );
    window.addEventListener("agritrack:harvest-updated", onSameTab);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("agritrack-harvest")
        : null;
    if (channel)
      channel.onmessage = (event) => refreshForCycle(event.data?.cropCycleId);
    return () => {
      window.removeEventListener("agritrack:harvest-updated", onSameTab);
      channel?.close();
    };
  }, [cycle]);
  const lot = lots.find((l) => l.id === selected);
  const issues = valuationIssues(form);
  function choose(id: string) {
    setSelected(id);
    setMessage([]);
    setConfirmed(false);
    const l = lots.find((v) => v.id === id);
    if (!l) return;
    setCycle(l.cropCycleId);
    setForm(l.assessment ? allocationForm(l.assessment) : blank());
    setHarvestTotal(l.harvested);
  }
  function change(
    key: keyof ReturnType<typeof blank>,
    value: string | boolean,
  ) {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...([
        "pricePerUnit",
        "damagedRecovery",
        "priceEvidence",
        "damaged",
        "wasted",
        "marketable",
      ].includes(key)
        ? { priceConfirmed: false }
        : {}),
    }));
    setConfirmed(false);
  }
  async function saveAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lot) return;
    if (
      !allocationMatches(
        harvestTotal,
        form.marketable,
        form.damaged,
        form.wasted,
      )
    ) {
      setError(
        protectionText(
          "Healthy + damaged + wasted must equal total harvested.",
        ),
      );
      return;
    }
    if (!confirmed) {
      setError(
        protectionText(
          "I confirm measured quantities and non-overlapping categories.",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        productionId: lot.harvestedLotId,
        harvestedLotId: lot.harvestedLotId,
        cropCycleId: lot.cropCycleId,
        totalHarvested: harvestTotal,
        version: lot.assessment?.version ?? 0,
        unit: lot.unit,
        quantitiesConfirmed: confirmed,
        pricePerUnit: form.pricePerUnit || undefined,
        damagedRecovery: form.damagedRecovery || undefined,
        priceEvidence: form.priceEvidence || undefined,
      };
      const response = await fetch("/api/crop-loss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      const updated = await load();
      const saved = resolveHarvestLot(
        updated,
        lot.cropCycleId,
        lot.harvestedLotId,
      );
      if (saved) {
        setHarvestTotal(saved.harvested);
        setForm(saved.assessment ? allocationForm(saved.assessment) : blank());
      }
      setConfirmed(false);
      setEditOpen(false);
      setMessage([
        "Allocation saved.",
        ...(data.monetaryLoss === null
          ? (data.valuationIssues as { message: string }[]).map(
              (item) => item.message,
            )
          : [formatLossMoney(data.monetaryLoss)]),
      ]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  const summary = resolveHarvestLot(lots, cycle, selected || undefined);
  const selectedCycle = cycles.find((item) => item.id === cycle);
  const weatherNeedsLocation =
    prevention?.weatherIssue?.code === "MISSING_COORDINATES" ||
    prevention?.weatherIssue?.code === "INVALID_COORDINATES";
  const soilReportMissing = prevention?.soilDetails.issues.some(
    (issue) => issue.code === "NO_FIELD_REPORT",
  );
  const farmEditUrl = selectedCycle
    ? `/farms?edit=${encodeURIComponent(selectedCycle.farmId)}#edit-farm-${encodeURIComponent(selectedCycle.farmId)}`
    : "/farms";
  const target =
    savedTargets[cycle] ??
    (selectedCycle?.expectedHarvestQuantity && selectedCycle.expectedHarvestUnit
      ? {
          quantity: selectedCycle.expectedHarvestQuantity,
          unit: selectedCycle.expectedHarvestUnit,
        }
      : null);
  useEffect(() => {
    setExpectedInput(target?.quantity ?? "");
    setExpectedUnitInput(target?.unit ?? "");
    setExpectedMessage("");
  }, [cycle, target?.quantity, target?.unit]);
  const actualCycleLots = lots.filter((item) => item.cropCycleId === cycle);
  const expectedActual = compareExpectedActual(
    target?.quantity,
    target?.unit,
    actualCycleLots.map((item) => ({
      harvested: item.harvested,
      unit: item.unit,
    })),
  );
  const inspectedLots = actualCycleLots.filter(
    (item) => item.storageInspections?.length,
  ).length;
  const progress = selectedCycle
    ? preventionProgress({
        inspectedLots,
        harvestedLots: actualCycleLots.length,
        completedActivities: selectedCycle.activitiesCompleted,
        totalActivities: selectedCycle.activitiesTotal,
        completedFollowUps: selectedCycle.followUpsCompleted,
        totalFollowUps: selectedCycle.followUpsTotal,
      })
    : { score: null, parts: [] };
  const farms = [
    ...new Map(lots.map((item) => [item.farmId, item.farmName])).entries(),
  ];
  const fields = [
    ...new Map(
      lots
        .filter((item) => !farmFilter || item.farmId === farmFilter)
        .map((item) => [item.fieldId, item.fieldName]),
    ).entries(),
  ];
  const crops = [
    ...new Map(lots.map((item) => [item.cropId, item.crop])).entries(),
  ];
  const reportLots = lots.map((item) => ({
    ...item,
    metrics: item.metricInput,
  }));
  const report = aggregateLossReport(reportLots, {
    farmId: farmFilter || undefined,
    fieldId: fieldFilter || undefined,
    cropId: cropFilter || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    unit: unitFilter || undefined,
  });
  const chartRows = report.crop.slice(0, 12).map((row) => ({
    crop: cropText(row.label),
    Harvested: Number(row.harvested),
    Healthy: Number(row.healthy),
    Damaged: Number(row.damaged),
    Wasted: Number(row.wasted),
    "Loss %": Number(row.lossPercent),
  }));
  async function saveExpected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cycle) return;
    setExpectedBusy(true);
    setExpectedMessage("");
    setError("");
    try {
      const response = await fetch("/api/crop-loss/expected-yield", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cropCycleId: cycle,
          expectedHarvestQuantity: expectedInput,
          expectedHarvestUnit: expectedUnitInput,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error ?? `Save failed (HTTP ${response.status}).`);
      const saved = {
        quantity: String(data.expectedHarvestQuantity),
        unit: String(data.expectedHarvestUnit),
      };
      setSavedTargets((current) => ({ ...current, [cycle]: saved }));
      setExpectedInput(saved.quantity);
      setExpectedUnitInput(saved.unit);
      setExpectedMessage(data.message ?? "Expected harvest saved.");
    } catch (e) {
      setExpectedMessage(
        e instanceof Error ? e.message : "Expected harvest could not be saved.",
      );
    } finally {
      setExpectedBusy(false);
    }
  }
  const offline = selectedCycle
    ? harvestDashboard({
        crop: selectedCycle.crop,
        stage: selectedCycle.stage,
        harvested: !!summary,
        hasAffected:
          !!summary?.metrics?.affected && Number(summary.metrics.affected) > 0,
        causes:
          summary?.metrics?.affected != null && summary.assessment
            ? [summary.assessment.cause]
            : [],
      })
    : null;
  const offlineDetails = selectedCycle
    ? harvestRiskDetails({
        crop: selectedCycle.crop,
        stage: selectedCycle.stage,
        harvested: !!summary,
        storageDetails: summary?.storageDetails,
        soilType: selectedCycle.soilType,
        soilTexture: selectedCycle.soilTexture,
        historicalStorageConcern: summary?.assessment?.cause === "Storage",
        pestOrDiseaseHistory:
          summary?.assessment?.cause === "Pest or disease observed",
      })
    : [];
  const dashboard = prevention?.dashboard ?? offline;
  const riskDetails = prevention?.dashboard?.riskDetails ?? offlineDetails;
  const riskSections = harvestRiskSections(
    dashboard?.risks ?? [],
    riskDetails,
    !!summary,
  );
  const latestInspection = summary?.storageInspections?.[0];
  const storageAssessment = summary
    ? ((prevention?.dashboard.storageRiskLotId === summary.id &&
      prevention?.dashboard.storageRiskInspectionVersion ===
        latestInspection?.version
        ? prevention.dashboard.storageRisks
        : undefined) ??
      storageRisk(
        latestInspection?.findings ?? emptyInspection,
        summary.crop,
        prevention?.forecastPreview,
      ))
    : null;
  const storageInspectionRisks =
    storageAssessment?.cards.filter(
      (card) => card.label !== "Rainfall probability",
    ) ?? [];
  const outdoorWeatherRisks =
    storageAssessment?.cards.filter(
      (card) => card.label === "Rainfall probability",
    ) ?? [];
  if (storageAssessment) {
    const previousCards = riskSections.current;
    riskSections.current = storageAssessment.cards.map(
      ({ source, standard, action, ...card }) => {
        const weather = card.label === "Rainfall probability";
        const detail = previousCards.find(
          (item) => item.label === card.label,
        )?.detail;
        const facts = [
          { label: "Recommended action", value: action },
          {
            label: "Data source",
            value: weather
              ? (prevention?.weatherSource ?? "Offline")
              : "Farmer observations",
            date: weather
              ? (prevention?.weatherFetchedAt ?? undefined)
              : latestInspection?.createdAt,
          },
          ...(!weather && latestInspection
            ? [
                {
                  label: "Inspection date",
                  value: latestInspection.inspectedOn.slice(0, 10),
                },
              ]
            : []),
          ...(source
            ? [
                {
                  label: "Scientific evidence",
                  value: standard ?? "Source",
                  source,
                },
                { label: "Dataset version", value: storageReferenceVersion },
              ]
            : []),
        ];
        return {
          ...card,
          phase: "storage",
          facts,
          detail: detail ? { ...detail, facts } : undefined,
        };
      },
    );
  }
  const photoReport = prevention?.dashboard?.photoReport;
  async function review(remind = false) {
    const sequence = ++requestSequence.current;
    setReviewing(true);
    setError("");
    try {
      const response = await fetch("/api/crop-loss/prevention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cropCycleId: cycle,
          productionId: summary?.id,
          remind,
          simplify: true,
          locale,
        }),
      });
      const data = (await response.json()) as Prevention & { error?: string };
      if (!response.ok) throw Error(data.error);
      if (sequence === requestSequence.current) {
        setPrevention(data);
        if (data.reminders) setReminders(data.reminders);
      }
    } catch (e) {
      if (sequence === requestSequence.current)
        setError(
          e instanceof TypeError
            ? "Live evidence is unavailable. Showing offline guidance."
            : e instanceof Error
              ? e.message
              : "Review unavailable",
        );
    } finally {
      if (sequence === requestSequence.current) setReviewing(false);
    }
  }
  const reviewLotId = summary?.id;
  const reviewVersion = summary?.assessment?.version;
  const inspectionVersion = summary?.storageInspections?.[0]?.version;
  useEffect(() => {
    if (!cycle || loading) return;
    let current: AbortController | null = null;
    let last = 0;
    const refresh = () => {
      if (document.hidden || current || Date.now() - last < 30_000) return;
      last = Date.now();
      const controller = new AbortController();
      const sequence = ++requestSequence.current;
      current = controller;
      setReviewing(true);
      fetch("/api/crop-loss/prevention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          cropCycleId: cycle,
          productionId: reviewLotId,
          automatic: true,
          locale,
        }),
      })
        .then(async (response) => {
          const data = (await response.json()) as Prevention;
          if (!response.ok) throw Error();
          if (
            sequence === requestSequence.current &&
            !controller.signal.aborted
          ) {
            setPrevention(data);
            if (data.reminders) setReminders(data.reminders);
          }
        })
        .catch(() => {
          if (
            sequence === requestSequence.current &&
            !controller.signal.aborted
          )
            setPrevention(null);
        })
        .finally(() => {
          current = null;
          if (
            sequence === requestSequence.current &&
            !controller.signal.aborted
          )
            setReviewing(false);
        });
    };
    setPrevention(null);
    refresh();
    const timer = window.setInterval(refresh, 5 * 60_000);
    const reconnected = () => {
      last = 0;
      refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", reconnected);
    return () => {
      current?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", reconnected);
    };
  }, [cycle, reviewLotId, reviewVersion, inspectionVersion, loading, locale]);
  function openDetails(details: HTMLDetailsElement | null) {
    if (details) {
      details.open = true;
      details.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }
  const unitText = (unit: string) =>
    protectionText(unit.toLowerCase()) === unit.toLowerCase()
      ? unit
      : protectionText(unit.toLowerCase());
  function cropText(value: string) {
    const alias = {
      paddy: "Rice",
      "rice (paddy)": "Rice",
      corn: "Maize",
      makka: "Maize",
      gram: "Chickpea",
    }[value.toLowerCase()];
    return protectionText(cropAdviceLabel(alias ?? value, locale));
  }
  const cropReference = selectedCycle
    ? cropPhReference(selectedCycle.crop)
    : null;
  const breakdown = summary?.metrics?.breakdown;
  const quantities =
    summary?.metrics?.affected != null ? summary.assessment : null;
  const distribution = quantities
    ? [
        {
          label: "Healthy or marketable",
          amount: quantities.marketable,
          color: "#378559",
        },
        { label: "Damaged", amount: quantities.damaged, color: "#b86b19" },
        {
          label: "Wasted or discarded",
          amount: quantities.wasted,
          color: "#a94846",
        },
      ]
    : [];
  return (
    <ProtectionLanguage>
      <div className="fertilizer-workspace harvest-loss-dashboard">
        <header className="page-header">
          <h1>Harvest loss and prevention</h1>
        </header>
        <section className="card">
          <label>
            Saved crop cycle
            <select
              disabled={loading}
              value={cycle}
              onChange={(e) => {
                setSelected("");
                setCycle(e.target.value);
                setPrevention(null);
              }}
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {cropText(c.crop)} — {c.label.slice(c.crop.length + 3)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Existing harvested lot
            <select value={selected} onChange={(e) => choose(e.target.value)}>
              <option value="">Choose a harvested lot</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {cropText(l.crop)} — {l.field} · {l.harvestDate}
                </option>
              ))}
            </select>
          </label>
          <h2>Harvest summary</h2>
          {loading ? (
            <p role="status">Loading harvest records…</p>
          ) : summary ? (
            <>
              <dl className="harvest-loss-identity">
                <div>
                  <dt>Crop</dt>
                  <dd>{cropText(summary.crop)}</dd>
                </div>
                <div>
                  <dt>Lot ID</dt>
                  <dd data-protection-raw>{summary.harvestedLotId}</dd>
                </div>
                <div>
                  <dt>Farm</dt>
                  <dd data-protection-raw>{summary.farmName}</dd>
                </div>
                <div>
                  <dt>Field</dt>
                  <dd data-protection-raw>{summary.fieldName}</dd>
                </div>
                <div>
                  <dt>Harvest date</dt>
                  <dd>
                    <time dateTime={summary.harvestDate}>
                      {summary.harvestDate}
                    </time>
                  </dd>
                </div>
              </dl>
              <dl className="harvest-loss-metrics">
                {[
                  ["Total harvested", summary.harvested, summary.unit],
                  [
                    "Healthy or marketable",
                    summary.assessment?.marketable,
                    summary.unit,
                  ],
                  ["Damaged", summary.assessment?.damaged, summary.unit],
                  [
                    "Wasted or discarded",
                    summary.assessment?.wasted,
                    summary.unit,
                  ],
                  ["Total affected", summary.metrics?.affected, summary.unit],
                  ["Affected percentage", summary.metrics?.lossPercent, "%"],
                  [
                    "Monetary loss",
                    summary.metrics?.monetaryLoss == null
                      ? null
                      : formatLossMoney(summary.metrics.monetaryLoss),
                    "",
                  ],
                  ["Recorded cause", summary.assessment?.cause, ""],
                ].map(([label, value, unit]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {value ?? "Not recorded"}
                      {value != null && unit && <> {unitText(unit)}</>}
                    </dd>
                  </div>
                ))}
              </dl>
              {distribution.length > 0 && (
                <figure>
                  <figcaption>Harvest distribution</figcaption>
                  <div className="harvest-loss-bar" aria-hidden="true">
                    {distribution.map((part) => (
                      <span
                        key={part.label}
                        style={{
                          flexGrow: Number(part.amount),
                          backgroundColor: part.color,
                        }}
                      />
                    ))}
                  </div>
                  <ul className="harvest-loss-legend">
                    {distribution.map((part) => (
                      <li key={part.label}>
                        <i
                          aria-hidden="true"
                          style={{ backgroundColor: part.color }}
                        />{" "}
                        {part.label} · {part.amount} {unitText(summary.unit)}
                      </li>
                    ))}
                  </ul>
                </figure>
              )}
              {!quantities && (
                <p className="notice">
                  Verified quantities are missing. Review the measured harvest
                  allocation.
                </p>
              )}
              {summary.metrics?.monetaryLoss == null && (
                <p className="notice">Insufficient valuation evidence</p>
              )}
            </>
          ) : (
            <p>
              {historyAvailable
                ? "No harvest lots recorded."
                : "History unavailable"}
            </p>
          )}
          <div className="harvest-loss-actions">
            {summary && (
              <button
                type="button"
                onClick={() => {
                  setSelected(summary.harvestedLotId);
                  setHarvestTotal(summary.harvested);
                  setForm(
                    summary.assessment
                      ? allocationForm(summary.assessment)
                      : blank(),
                  );
                  setConfirmed(false);
                  setError("");
                  setEditOpen(true);
                }}
              >
                Edit Harvest Details
              </button>
            )}
            <button type="button" onClick={() => openDetails(analysis.current)}>
              View detailed analysis
            </button>
            <button type="button" onClick={() => openDetails(sources.current)}>
              View scientific sources
            </button>
            <button
              type="button"
              disabled={!cycle || busy || reviewing}
              onClick={() => review(true)}
            >
              Add prevention reminders
            </button>
            <button type="button" onClick={() => window.print()}>
              Print loss report
            </button>
          </div>
        </section>
        <section
          className="card harvest-loss-report"
          aria-labelledby="harvest-loss-report-title"
        >
          <h2 id="harvest-loss-report-title">
            Crop-wise harvest loss comparison
          </h2>
          <p>
            Charts and reports use saved, measured harvest allocations only.
            Values stay grouped by unit.
          </p>
          <div className="harvest-loss-filters">
            <label>
              Farm
              <select
                value={farmFilter}
                onChange={(event) => {
                  setFarmFilter(event.target.value);
                  setFieldFilter("");
                }}
              >
                <option value="">All farms</option>
                {farms.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Field
              <select
                value={fieldFilter}
                onChange={(event) => setFieldFilter(event.target.value)}
              >
                <option value="">All fields</option>
                {fields.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Crop
              <select
                value={cropFilter}
                onChange={(event) => setCropFilter(event.target.value)}
              >
                <option value="">All crops</option>
                {crops.map(([id, name]) => (
                  <option key={id} value={id}>
                    {cropText(name)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unit
              <select
                value={unitFilter}
                onChange={(event) => setUnitFilter(event.target.value)}
              >
                <option value="">All unit groups</option>
                {[...new Set(lots.map((item) => item.unit))].map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              From date
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>
            <label>
              To date
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
          </div>
          {!report.includedLots ? (
            <p className="notice">
              No measured harvest allocations match these filters.
            </p>
          ) : (
            <>
              <div
                className="harvest-loss-chart"
                role="img"
                aria-label="Crop-wise comparison of harvested, healthy, damaged and wasted quantities"
              >
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={chartRows}
                    margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                  >
                    <XAxis
                      dataKey="crop"
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={62}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Harvested" fill="#246b45" />
                    <Bar dataKey="Healthy" fill="#78a95b" />
                    <Bar dataKey="Damaged" fill="#d58a32" />
                    <Bar dataKey="Wasted" fill="#b84848" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <h3>Loss percentage by crop</h3>
              <div
                className="harvest-loss-chart"
                role="img"
                aria-label="Comparison of recorded affected percentages by crop"
              >
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart
                    data={chartRows}
                    margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                  >
                    <XAxis
                      dataKey="crop"
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={62}
                    />
                    <YAxis unit="%" />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Bar dataKey="Loss %" fill="#c45b41" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <h3>Monthly and yearly loss report</h3>
              <div className="fertilizer-table">
                <table>
                  <caption>
                    Confirmed harvest allocations in selected date range
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Unit</th>
                      <th scope="col">Harvested</th>
                      <th scope="col">Affected</th>
                      <th scope="col">Loss %</th>
                      <th scope="col">Monetary loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.month.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">{row.label}</th>
                        <td>{unitText(row.unit)}</td>
                        <td>{row.harvested}</td>
                        <td>{row.affected}</td>
                        <td>{row.lossPercent}%</td>
                        <td>
                          {row.monetaryLoss === null
                            ? "Not verified"
                            : formatLossMoney(row.monetaryLoss)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="fertilizer-table">
                <table>
                  <caption>Yearly totals</caption>
                  <thead>
                    <tr>
                      <th scope="col">Year</th>
                      <th scope="col">Unit</th>
                      <th scope="col">Harvested</th>
                      <th scope="col">Healthy</th>
                      <th scope="col">Damaged</th>
                      <th scope="col">Wasted</th>
                      <th scope="col">Affected</th>
                      <th scope="col">Loss %</th>
                      <th scope="col">Monetary loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.year.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">{row.label}</th>
                        <td>{unitText(row.unit)}</td>
                        <td>{row.harvested}</td>
                        <td>{row.healthy}</td>
                        <td>{row.damaged}</td>
                        <td>{row.wasted}</td>
                        <td>{row.affected}</td>
                        <td>{row.lossPercent}%</td>
                        <td>
                          {row.monetaryLoss === null
                            ? "Not verified"
                            : formatLossMoney(row.monetaryLoss)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <button type="button" onClick={() => window.print()}>
            Print monthly loss report
          </button>
        </section>
        <section className="card" aria-labelledby="harvest-loss-progress-title">
          <h2 id="harvest-loss-progress-title">Prevention progress</h2>
          {progress.score === null ? (
            <p>
              No inspection, activity or follow-up records are available to
              calculate progress.
            </p>
          ) : (
            <>
              <p>
                <strong>{progress.score}%</strong> recorded prevention progress
              </p>
              <progress
                max={100}
                value={progress.score}
                aria-label={`Prevention progress ${progress.score}%`}
              />
              <ul>
                {progress.parts.map((part) => (
                  <li key={part.label}>
                    {part.label}: {part.completed} of {part.total}
                  </li>
                ))}
              </ul>
              <p>
                Score method: inspections 40%, completed crop activities 30%,
                and completed follow-ups 30%. If a record group has no entries,
                the score is calculated from the groups with recorded entries.
              </p>
              <p>
                A high score does not guarantee that crop loss will not happen.
              </p>
            </>
          )}
        </section>
        <section className="card" aria-labelledby="harvest-expected-title">
          <h2 id="harvest-expected-title">Expected vs actual harvest</h2>
          {!selectedCycle ? (
            <p>Select a saved crop cycle.</p>
          ) : (
            <>
              {target ? (
                <>
                  <p>
                    Expected:{" "}
                    <strong>
                      {target.quantity} {unitText(target.unit)}
                    </strong>
                  </p>
                  {expectedActual.available ? (
                    <dl className="harvest-loss-metrics">
                      <div>
                        <dt>Actual harvested</dt>
                        <dd>
                          {expectedActual.actual}{" "}
                          {unitText(expectedActual.unit)}
                        </dd>
                      </div>
                      <div>
                        <dt>Difference (actual − expected)</dt>
                        <dd>
                          {expectedActual.difference}{" "}
                          {unitText(expectedActual.unit)}
                        </dd>
                      </div>
                      <div>
                        <dt>Difference</dt>
                        <dd>{expectedActual.differencePercent}%</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="notice">{expectedActual.reason}</p>
                  )}
                </>
              ) : (
                <p>
                  Planned harvest quantity is not recorded for this crop cycle.
                </p>
              )}
              <form className="harvest-loss-filters" onSubmit={saveExpected}>
                <label>
                  Expected quantity
                  <input
                    required
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={expectedInput}
                    onChange={(event) => setExpectedInput(event.target.value)}
                    placeholder="Enter measured plan"
                  />
                </label>
                <label>
                  Unit
                  <select
                    required
                    value={expectedUnitInput}
                    onChange={(event) =>
                      setExpectedUnitInput(event.target.value)
                    }
                  >
                    <option value="">Choose unit</option>
                    {[
                      ...new Set([
                        ...lots.map((item) => item.unit),
                        ...(target ? [target.unit] : []),
                        "quintal",
                        "kg",
                        "tonne",
                      ]),
                    ].map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
                <button className="btn" disabled={expectedBusy}>
                  {expectedBusy ? "Saving…" : "Save expected harvest"}
                </button>
                <p role="status">{expectedMessage}</p>
              </form>
            </>
          )}
        </section>
        {editOpen && lot && (
          <div
            className="harvest-loss-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setEditOpen(false);
            }}
          >
            <section
              className="harvest-loss-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="harvest-loss-edit-title"
            >
              <form onSubmit={saveAllocation}>
                <h2 id="harvest-loss-edit-title">Edit Harvest Details</h2>
                <p>
                  {cropText(lot.crop)} · {lot.field} · {lot.harvestDate}
                </p>
                <label>
                  {protectionText("Total harvested")} ({unitText(lot.unit)})
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={harvestTotal}
                    onChange={(event) => setHarvestTotal(event.target.value)}
                  />
                </label>
                <label>
                  {protectionText("Healthy or marketable")} (
                  {unitText(lot.unit)})
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    required
                    value={form.marketable}
                    onChange={(event) =>
                      change("marketable", event.target.value)
                    }
                  />
                </label>
                <label>
                  {protectionText("Damaged")} ({unitText(lot.unit)})
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    required
                    value={form.damaged}
                    onChange={(event) => change("damaged", event.target.value)}
                  />
                </label>
                <label>
                  {protectionText("Wasted or discarded")} ({unitText(lot.unit)})
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    required
                    value={form.wasted}
                    onChange={(event) => change("wasted", event.target.value)}
                  />
                </label>
                <label>
                  {protectionText("Full-quality INR per")} {unitText(lot.unit)}{" "}
                  ({protectionText("optional")})
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.pricePerUnit}
                    onChange={(event) =>
                      change("pricePerUnit", event.target.value)
                    }
                  />
                </label>
                <label>
                  {protectionText(
                    "Total recovered INR from damaged portion (explicit zero if none)",
                  )}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.damagedRecovery}
                    onChange={(event) =>
                      change("damagedRecovery", event.target.value)
                    }
                  />
                </label>
                <label>
                  {protectionText(
                    "Price/recovery evidence: receipt, date and reference",
                  )}
                  <input
                    maxLength={500}
                    value={form.priceEvidence}
                    onChange={(event) =>
                      change("priceEvidence", event.target.value)
                    }
                  />
                </label>
                <label>
                  {protectionText("Recorded cause")}
                  <select
                    required
                    value={form.cause}
                    onChange={(event) => change("cause", event.target.value)}
                  >
                    {[
                      "Unknown",
                      "Weather exposure",
                      "Storage",
                      "Handling",
                      "Pest or disease observed",
                      "Other",
                    ].map((cause) => (
                      <option key={cause}>{cause}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {protectionText("Measurement evidence / record reference")}
                  <input
                    required
                    minLength={3}
                    maxLength={500}
                    value={form.evidence}
                    onChange={(event) => change("evidence", event.target.value)}
                  />
                </label>
                <label className="harvest-loss-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  {protectionText(
                    "I confirm measured quantities and non-overlapping categories.",
                  )}
                </label>
                <label className="harvest-loss-confirm">
                  <input
                    type="checkbox"
                    checked={form.priceConfirmed}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        priceConfirmed: event.target.checked,
                      }))
                    }
                  />
                  {protectionText(
                    "I verified same-unit price and actual damaged recovery.",
                  )}
                </label>
                {(form.pricePerUnit ||
                  form.damagedRecovery ||
                  form.priceEvidence ||
                  form.priceConfirmed) &&
                  issues.length > 0 && (
                    <div className="notice">
                      {issues.map((issue) => (
                        <p key={issue.code}>{issue.message}</p>
                      ))}
                    </div>
                  )}
                {error && <p role="alert">{error}</p>}
                <div className="harvest-loss-modal-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditOpen(false);
                      setForm(
                        lot.assessment
                          ? allocationForm(lot.assessment)
                          : blank(),
                      );
                      setHarvestTotal(lot.harvested);
                      setConfirmed(false);
                      setError("");
                    }}
                  >
                    {protectionText("Cancel")}
                  </button>
                  <button className="btn" type="submit" disabled={busy}>
                    {busy ? protectionText("Saving…") : protectionText("Save")}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
        {summary && (
          <StorageInspectionForm
            key={summary.id}
            lot={{
              ...summary,
              storageInspections: summary.storageInspections ?? [],
            }}
            onSaved={async (rows) => {
              if (rows) setReminders(rows);
              await load();
            }}
          />
        )}
        {dashboard && (
          <section className="card">
            <h2>Risk assessment</h2>
            {storageAssessment && (
              <>
                <p>
                  <strong>Overall storage risk</strong>{" "}
                  <span
                    className="harvest-loss-status"
                    data-risk={storageAssessment.status}
                  >
                    {storageAssessment.riskLevel ?? storageAssessment.status}
                  </span>
                </p>
                <StorageReadout
                  key={`${summary?.id}:${latestInspection?.version}:${storageAssessment.guidelineOrigin}:${locale}`}
                  locale={locale}
                  text={[
                    protectionText("Overall storage risk"),
                    protectionText(
                      storageAssessment.riskLevel ?? storageAssessment.status,
                    ),
                    ...storageInspectionRisks.flatMap((card) => [
                      protectionText(card.label),
                      card.value ? protectionText(card.value) : "",
                      protectionText(card.status),
                      protectionText(card.note),
                      card.status !== "No current concern"
                        ? protectionText(card.action)
                        : "",
                    ]),
                  ]
                    .filter(Boolean)
                    .join(". ")}
                />
                {storageAssessment.guidelineOrigin === "Verified online" && (
                  <p>
                    <a href={storageAssessment.reference?.source}>
                      Verified online · IRRI
                    </a>
                  </p>
                )}
                {storageAssessment.interactingRisks && (
                  <p>
                    Several recorded risks are acting together. Inspect this lot
                    promptly.
                  </p>
                )}
                {storageAssessment.drivers.length > 0 && (
                  <>
                    <p>Factors needing attention:</p>
                    <ul>
                      {storageAssessment.drivers.map((driver, index) => (
                        <li key={`${driver.label}-${index}`}>
                          <strong>{driver.label}:</strong> {driver.status} ·{" "}
                          {driver.note}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p>
                  Outdoor weather only. It is not an indoor storage measurement.
                </p>
                <p>
                  {prevention?.weatherSource ?? "Offline"} ·{" "}
                  {prevention?.currentWeather?.temperature == null
                    ? "Not recorded"
                    : `${prevention.currentWeather.temperature} °C`}{" "}
                  ·{" "}
                  {prevention?.currentWeather?.humidity == null
                    ? "Not recorded"
                    : `${prevention.currentWeather.humidity}%`}
                  {prevention?.weatherFetchedAt && (
                    <time dateTime={prevention.weatherFetchedAt}>
                      {" "}
                      ·{" "}
                      {new Date(prevention.weatherFetchedAt).toLocaleString(
                        locale,
                        { timeZone: "Asia/Kolkata" },
                      )}
                    </time>
                  )}
                </p>
                <h3>{farmerAdviceLabels(locale)[0]}</h3>
                <p>
                  {latestInspection
                    ? "Storage risk is based on the latest saved inspection."
                    : "No storage inspection is saved; missing inspection details require a check."}{" "}
                  {storageAssessment.drivers.length
                    ? storageAssessment.drivers
                        .map((driver) => protectionText(driver.label))
                        .join(", ")
                    : "No concern was recorded in measured inspection findings."}
                </p>
                <h3>{farmerAdviceLabels(locale)[1]}</h3>
                <p>
                  {storageAssessment.drivers
                    .map((driver) => protectionText(driver.note))
                    .join(" ") || protectionText("No cause is recorded.")}
                </p>
                <h3>{farmerAdviceLabels(locale)[2]}</h3>
                <ul>
                  {storageAssessment.drivers.map((driver) => {
                    const action = storageInspectionRisks.find(
                      (card) => card.label === driver.label,
                    )?.action;
                    return action ? (
                      <li key={driver.label}>
                        {driver.label}: {action}
                      </li>
                    ) : null;
                  })}
                </ul>
                <h3>{farmerAdviceLabels(locale)[4]}</h3>
                <p>
                  {farmerStorageUrgency(
                    locale,
                    storageAssessment.status === "High concern" ||
                      storageAssessment.status === "Potential concern"
                      ? 0
                      : storageAssessment.status === "Inspection required"
                        ? 1
                        : storageAssessment.drivers.some((driver) =>
                              driver.note?.includes("Guideline unavailable"),
                            )
                          ? 2
                          : storageAssessment.status === "Insufficient data"
                            ? 3
                            : 4,
                  )}
                </p>
              </>
            )}
            {latestInspection?.findings.mold === "Observed" && (
              <p className="notice">Mold reported.</p>
            )}
            {reviewing && (
              <p role="status">Checking saved evidence and weather…</p>
            )}
            {!reviewing && !prevention && (
              <p className="notice">
                Live evidence is unavailable. Showing offline guidance.
              </p>
            )}
            {prevention?.weatherIssue && (
              <p className="notice">Weather data is unavailable.</p>
            )}
            <h3 className="harvest-risk-phase">
              {summary ? "After harvest" : "Before harvest"}
            </h3>
            <RiskGrid
              cards={
                storageAssessment
                  ? storageInspectionRisks.map(
                      ({ source, standard, action, ...card }) => {
                        const detail = riskSections.current.find(
                          (item) => item.label === card.label,
                        )?.detail;
                        return {
                          ...card,
                          phase: "storage" as const,
                          facts: [
                            { label: "Recommended action", value: action },
                            {
                              label: "Data source",
                              value: "Farmer-entered inspection",
                            },
                            ...(source
                              ? [
                                  {
                                    label: "Scientific reference",
                                    value: standard ?? "Source",
                                    source,
                                  },
                                  {
                                    label: "Dataset version",
                                    value: storageReferenceVersion,
                                  },
                                ]
                              : []),
                          ],
                          detail: detail
                            ? {
                                ...detail,
                                facts: [
                                  {
                                    label: "Recommended action",
                                    value: action,
                                  },
                                  ...(source
                                    ? [
                                        {
                                          label: "Scientific reference",
                                          value: standard ?? "Source",
                                          source,
                                        },
                                      ]
                                    : []),
                                ],
                              }
                            : undefined,
                        };
                      },
                    )
                  : riskSections.current
              }
              photoReport={photoReport}
            />
            {storageAssessment && (
              <>
                <h3>Outdoor weather forecast (separate from storage risk)</h3>
                <RiskGrid
                  cards={outdoorWeatherRisks.map((card) => ({
                    ...card,
                    phase: "storage" as const,
                  }))}
                  photoReport={photoReport}
                />
              </>
            )}
            {riskSections.fieldHistory.length > 0 && (
              <details className="harvest-risk-history">
                <summary>Before harvest</summary>
                <RiskGrid
                  cards={riskSections.fieldHistory}
                  photoReport={photoReport}
                />
              </details>
            )}
          </section>
        )}
        {dashboard && (
          <section className="card">
            <h2>Loss prevention recommendations</h2>
            <h3>{farmerAdviceLabels(locale)[0]}</h3>
            <p>{summary ? "After harvest" : "Before harvest"}</p>
            <h3>{farmerAdviceLabels(locale)[1]}</h3>
            <p>Possible causes need a field or storage check.</p>
            {summary && prevention?.dashboard.storageWording?.mode === "ai" && (
              <p>Gemini helped choose simpler wording.</p>
            )}
            {storageAssessment && (
              <ul>
                {storageAssessment.cards
                  .filter((card) =>
                    [
                      "Potential concern",
                      "High concern",
                      "Inspection required",
                    ].includes(card.status),
                  )
                  .map((card) => (
                    <li key={card.label}>
                      <strong>{card.label}</strong>
                      <p>{card.action}</p>
                      {prevention?.dashboard.storageWording?.actions.find(
                        (item) => item.id === card.label,
                      )?.text === card.action && <p>{card.note}</p>}
                    </li>
                  ))}
              </ul>
            )}
            {latestInspection?.findings.mold === "Observed" &&
              !dashboard.actions.some((action) => action.id === "separate") && (
                <p>
                  Keep damaged or spoiled produce separate from healthy produce.
                </p>
              )}
            <p>
              {prevention?.dashboard?.mode === "ai"
                ? "Gemini helped choose simpler wording."
                : "Offline agricultural guidance"}
            </p>
            <h3>{farmerAdviceLabels(locale)[2]}</h3>
            <div className="harvest-loss-recommendations">
              {actionSections
                .filter((section) => section !== "Future crop prevention")
                .map((section) => {
                  const actions = dashboard.actions.filter(
                    (action) =>
                      action.section === section && action.id !== "drainage",
                  );
                  return (
                    actions.length > 0 && (
                      <section key={section}>
                        <h3>{section}</h3>
                        <ul>
                          {actions.map((action) => (
                            <li key={action.id}>
                              {locale !== "en" &&
                              protectionText(action.text) === action.text
                                ? action.short
                                : action.text}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )
                  );
                })}
            </div>
          </section>
        )}
        <section className="card" aria-labelledby="cause-guidance-title">
          <h2 id="cause-guidance-title">Cause-specific prevention advice</h2>
          {(() => {
            const cause = summary?.assessment?.cause;
            const category =
              cause === "Storage"
                ? "Storage"
                : cause === "Weather exposure"
                  ? "Moisture or weather"
                  : cause === "Pest or disease observed"
                    ? "Pest or disease"
                    : cause === "Handling"
                      ? "Handling"
                      : null;
            const current =
              dashboard?.actions.filter(
                (action) =>
                  action.section !== "Future crop prevention" &&
                  action.id !== "drainage",
              ) ?? [];
            const future =
              dashboard?.actions.filter(
                (action) =>
                  action.section === "Future crop prevention" ||
                  action.id === "drainage",
              ) ?? [];
            return (
              <div className="harvest-loss-recommendations">
                <section>
                  <h3>What is the problem?</h3>
                  <p>
                    {category
                      ? `${category} concern recorded: ${cause}.`
                      : "No loss cause is recorded. Record observed evidence before choosing a cause."}
                  </p>
                </section>
                <section>
                  <h3>What could be the reason?</h3>
                  <p>
                    {category
                      ? "This is the recorded cause only. It does not confirm a pest, disease or weather diagnosis; inspect the crop and saved evidence."
                      : "The reason is not established from the available records."}
                  </p>
                </section>
                <section>
                  <h3>What should the farmer do?</h3>
                  {current.length ? (
                    current
                      .slice(0, 3)
                      .map((action) => (
                        <p key={action.id}>
                          {locale !== "en" &&
                          protectionText(action.text) === action.text
                            ? action.short
                            : action.text}
                        </p>
                      ))
                  ) : (
                    <p>
                      No verified action is available for this recorded cause.
                    </p>
                  )}
                </section>
                <section>
                  <h3>How can loss be reduced next time?</h3>
                  {future.length ? (
                    future.map((action) => (
                      <p key={action.id}>
                        {locale !== "en" &&
                        protectionText(action.text) === action.text
                          ? action.short
                          : action.text}
                      </p>
                    ))
                  ) : (
                    <p>No prevention activity is recorded yet.</p>
                  )}
                </section>
                <section>
                  <h3>Cause records</h3>
                  <ul>
                    <li>
                      <strong>Pest:</strong>{" "}
                      {cause === "Pest or disease observed"
                        ? "Pest or disease was recorded together; the record does not distinguish them. Inspect the crop."
                        : "Not recorded separately."}
                    </li>
                    <li>
                      <strong>Disease:</strong>{" "}
                      {cause === "Pest or disease observed"
                        ? "Pest or disease was recorded together; the record does not confirm disease. Ask a local adviser to inspect symptoms."
                        : "Not recorded separately."}
                    </li>
                    <li>
                      <strong>Moisture:</strong>{" "}
                      {cause === "Weather exposure"
                        ? "Weather exposure was recorded; no moisture measurement is linked."
                        : "No moisture-related cause recorded."}
                    </li>
                    <li>
                      <strong>Weather:</strong>{" "}
                      {cause === "Weather exposure"
                        ? "Weather exposure recorded in the harvest assessment."
                        : "No weather cause recorded in the harvest assessment."}
                    </li>
                    <li>
                      <strong>Storage:</strong>{" "}
                      {cause === "Storage"
                        ? "Storage was recorded as a cause."
                        : latestInspection
                          ? `Storage inspection saved ${latestInspection.inspectedOn.slice(0, 10)}; see its recorded findings.`
                          : "No storage inspection is recorded."}
                    </li>
                  </ul>
                </section>
              </div>
            );
          })()}
        </section>
        {dashboard && (
          <section className="card">
            <h2>Future crop prevention</h2>
            {dashboard.actions
              .filter(
                (action) =>
                  action.section === "Future crop prevention" ||
                  action.id === "drainage",
              )
              .map((action) => (
                <p key={action.id}>
                  {locale !== "en" &&
                  protectionText(action.text) === action.text
                    ? action.short
                    : action.text}
                </p>
              ))}
            {riskSections.future.length > 0 && (
              <RiskGrid cards={riskSections.future} photoReport={photoReport} />
            )}
            {!!prevention?.deficiencies?.length && (
              <div className="fertilizer-table">
                <table>
                  <caption>Low nutrients in the saved soil test</caption>
                  <thead>
                    <tr>
                      <th>Nutrient</th>
                      <th>Measured value</th>
                      <th>Applicable reference range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prevention.deficiencies.map((row) => (
                      <tr key={row.name}>
                        <th scope="row">{row.name}</th>
                        <td>
                          {row.value} {row.unit} · {row.method} · {row.basis}
                        </td>
                        <td>
                          <a href={row.sourceUrl}>{row.range}</a>
                          {row.interpretation && (
                            <p>
                              {row.interpretation.value}{" "}
                              {row.interpretation.unit} ·{" "}
                              {row.interpretation.basis}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  <time dateTime={prevention.sampleDate}>
                    {prevention.sampleDate?.slice(0, 10)}
                  </time>
                </p>
              </div>
            )}
            {cropReference && (
              <p>
                <a href={cropReference.source}>Published crop pH optimum</a> ·{" "}
                {cropReference.range.join("–")} · {cropReference.version}.{" "}
                <span>
                  Ask the laboratory to check whether its pH method is
                  comparable.
                </span>
              </p>
            )}
          </section>
        )}
        {error && <p role="alert">{error}</p>}
        <section className="card">
          <h2>Measured harvest allocation</h2>
          {historyAvailable && lots.length === 0 && (
            <p>
              No harvest lots recorded.{" "}
              <Link href="/harvests">Open Harvest Center</Link>
            </p>
          )}
          {lot && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const payload = {
                    ...form,
                    productionId: lot.harvestedLotId,
                    harvestedLotId: lot.harvestedLotId,
                    cropCycleId: lot.cropCycleId,
                    version: lot.assessment?.version ?? 0,
                    unit: lot.unit,
                    quantitiesConfirmed: confirmed,
                    pricePerUnit: form.pricePerUnit || undefined,
                    damagedRecovery: form.damagedRecovery || undefined,
                    priceEvidence: form.priceEvidence || undefined,
                  };
                  const r = await fetch("/api/crop-loss", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  const d = await r.json();
                  if (!r.ok) throw Error(d.error);
                  await load();
                  setConfirmed(false);
                  setMessage([
                    "Allocation saved.",
                    ...(d.monetaryLoss === null
                      ? (d.valuationIssues as { message: string }[]).map(
                          (v) => v.message,
                        )
                      : [formatLossMoney(d.monetaryLoss)]),
                  ]);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Save failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p>
                Harvested {lot.harvested} {unitText(lot.unit)}; sold {lot.sold}{" "}
                {unitText(lot.unit)}. Marketable includes sold produce;
                categories must not overlap.
              </p>
              <div className="fertilizer-grid">
                <label>
                  Assessment date
                  <input
                    type="date"
                    required
                    value={form.assessedDate}
                    onChange={(e) => change("assessedDate", e.target.value)}
                  />
                </label>
                {(
                  [
                    ["marketable", `Marketable (${lot.unit})`],
                    ["damaged", `Damaged, excluding waste (${lot.unit})`],
                    ["wasted", `Wasted / discarded (${lot.unit})`],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.001"
                      value={form[key]}
                      onChange={(e) => change(key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <label>
                Measurement evidence / record reference
                <input
                  required
                  minLength={3}
                  maxLength={500}
                  value={form.evidence}
                  onChange={(e) => change("evidence", e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirm measured quantities and non-overlapping categories.
              </label>
              <h3>Optional evidence-based valuation</h3>
              <label>
                Full-quality INR per {lot.unit}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.pricePerUnit}
                  onChange={(e) => change("pricePerUnit", e.target.value)}
                />
              </label>
              <label>
                Total recovered INR from damaged portion (explicit zero if none)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.damagedRecovery}
                  onChange={(e) => change("damagedRecovery", e.target.value)}
                />
              </label>
              <label>
                Price/recovery evidence: receipt, date and reference
                <input
                  maxLength={500}
                  value={form.priceEvidence}
                  onChange={(e) => change("priceEvidence", e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.priceConfirmed}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priceConfirmed: e.target.checked }))
                  }
                />
                I verified same-unit price and actual damaged recovery.
              </label>
              <div id="crop-loss-valuation-status">
                {issues.length ? (
                  issues.map((i) => <p key={i.code}>{i.message}</p>)
                ) : (
                  <p>
                    Price and recovery evidence complete; measured allocation is
                    validated when saved.
                  </p>
                )}
              </div>
              <label>
                Observed cause
                <select
                  value={form.cause}
                  onChange={(e) => change("cause", e.target.value)}
                >
                  {[
                    "Unknown",
                    "Weather exposure",
                    "Storage",
                    "Handling",
                    "Pest or disease observed",
                    "Other",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Notes
                <textarea
                  maxLength={2000}
                  value={form.notes}
                  onChange={(e) => change("notes", e.target.value)}
                />
              </label>
              <button className="btn" disabled={busy}>
                {lot.assessment
                  ? "Save corrected allocation"
                  : "Save measured allocation"}
              </button>
              <p role="status">
                {message.map((line, index) => (
                  <span key={index}>{line} </span>
                ))}
              </p>
            </form>
          )}
        </section>
        <details className="card" ref={analysis}>
          <summary>Detailed analysis</summary>
          <h2>Measured outcomes</h2>
          <label>
            Group results by
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value)}
            >
              {["year", "season", "crop", "field"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <div className="fertilizer-table">
            <table
              aria-label={`${dimension}-wise measured post-harvest outcomes`}
            >
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Harvested</th>
                  <th>Affected</th>
                  <th>Loss %</th>
                  <th>Monetary loss</th>
                  <th>Missing evidence</th>
                </tr>
              </thead>
              <tbody>
                {(groups[dimension] ?? []).map((g) => (
                  <tr key={g.key}>
                    <td>{g.label}</td>
                    <td>
                      {g.harvested} {unitText(g.unit)}
                    </td>
                    <td>
                      {g.affected} {unitText(g.unit)}
                    </td>
                    <td>{g.lossPercent ?? "Unknown"}</td>
                    <td>
                      {g.monetaryLoss === null
                        ? "Insufficient valuation evidence"
                        : formatLossMoney(g.monetaryLoss)}
                    </td>
                    <td>{g.valuationIssues.map((i) => i.message).join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Recent recorded losses in this field</h3>
          {prevention?.history?.map((entry, index) => (
            <p key={index}>
              {entry.harvestDate} · {entry.crop} · {entry.cause} ·{" "}
              {entry.damaged} {entry.unit} / {entry.wasted} {entry.unit}
            </p>
          ))}
          {summary?.assessment?.revisions?.length ? (
            <details>
              <summary>Assessment history</summary>
              {summary.assessment.revisions.map((previous) => (
                <p key={previous.version}>
                  {previous.assessedDate.slice(0, 10)} · {previous.cause} ·{" "}
                  {previous.marketable} / {previous.damaged} / {previous.wasted}{" "}
                  {unitText(summary.unit)}
                </p>
              ))}
            </details>
          ) : null}
          <h3>Calculation methodology</h3>
          {breakdown && summary && quantities && (
            <dl>
              <dt>Healthy market price</dt>
              <dd>
                {formatLossMoney(breakdown.pricePerUnit)} /{" "}
                {unitText(summary.unit)}
              </dd>
              <dt>Full-quality value of damaged produce</dt>
              <dd>
                {quantities.damaged} {unitText(summary.unit)} ×{" "}
                {formatLossMoney(breakdown.pricePerUnit)} ={" "}
                {formatLossMoney(breakdown.damagedFullValue)}
              </dd>
              <dt>Recovered from damaged produce</dt>
              <dd>−{formatLossMoney(breakdown.damagedRecovery)}</dd>
              <dt>Full-quality value of discarded produce</dt>
              <dd>
                {quantities.wasted} {unitText(summary.unit)} ×{" "}
                {formatLossMoney(breakdown.pricePerUnit)} ={" "}
                {formatLossMoney(breakdown.discardedFullValue)}
              </dd>
              <dt>Monetary loss</dt>
              <dd>{formatLossMoney(summary.metrics!.monetaryLoss!)}</dd>
            </dl>
          )}
          <p>
            Affected quantity is damaged plus wasted produce. Affected
            percentage uses the total harvest. Monetary loss uses the verified
            full-quality price and subtracts the amount recovered from damaged
            produce.
          </p>
        </details>
        <details className="card">
          <summary>Prevention review</summary>
          <button
            type="button"
            disabled={!cycle || busy || reviewing}
            onClick={() => review()}
          >
            Review risks &amp; guidance
          </button>
          {prevention && (
            <div>
              <h3>Detailed weather forecast</h3>
              {weatherNeedsLocation ? (
                <>
                  <p>Save your farm coordinates to see the weather forecast.</p>
                  <Link className="btn" href={farmEditUrl}>
                    {farmLabels("edit")}
                  </Link>
                </>
              ) : (
                <>
                  <p>{prevention.weatherStatus}</p>
                  {prevention.weatherIssue && (
                    <>
                      <p>{prevention.weatherIssue.action}</p>
                      <button
                        type="button"
                        disabled={busy || reviewing}
                        onClick={() => review()}
                      >
                        Retry live weather review
                      </button>
                    </>
                  )}
                </>
              )}
              {prevention.forecastPreview.length > 0 && (
                <>
                  <h3>Available forecast data · next three model dates</h3>
                  {prevention.forecastPreview.map((f) => (
                    <p key={f.date}>
                      {f.date}: rain {f.rainMm ?? "Unknown"} mm; probability{" "}
                      {f.rainProbability ?? "Unknown"}%; {f.minC ?? "Unknown"}–
                      {f.maxC ?? "Unknown"} °C
                    </p>
                  ))}
                </>
              )}
              <h3>Soil laboratory report</h3>
              {soilReportMissing ? (
                <p>Add a dated laboratory soil report for this field.</p>
              ) : (
                <>
                  <p>{prevention.soilStatus}</p>
                  {prevention.soilDetails.issues.map((issue) => (
                    <p key={issue.code}>{issue.message}</p>
                  ))}
                </>
              )}
              {prevention.soilDetails.issues.length > 0 && cycle && (
                <Link
                  className="btn"
                  href={`/fertilizer-recommendation?cycle=${encodeURIComponent(cycle)}`}
                >
                  {soilLabels("title")}
                </Link>
              )}
              {prevention.stageGuidance && (
                <>
                  <h3>Verified establishment-stage guidance</h3>
                  <p>{prevention.stageGuidance.title}</p>
                  <p>{prevention.stageGuidance.message}</p>
                  {(
                    prevention.stageGuidance.actions ??
                    prevention.stageGuidance.guidance ??
                    []
                  ).map((v) => (
                    <p key={v}>{v}</p>
                  ))}
                </>
              )}
              <p>{prevention.advice.summary}</p>
              <p>{prevention.advice.drainage}</p>
              <p>{prevention.advice.nutrientPlan}</p>
              {prevention.alerts.map((a) => (
                <p key={a.code}>
                  {a.message} {a.uncertainty} <a href={a.sourceUrl}>Source</a>
                </p>
              ))}
              <button
                type="button"
                disabled={busy || reviewing}
                onClick={() => review(true)}
              >
                Add evidence-based reminders
              </button>
              <p>{prevention.limitations}</p>
            </div>
          )}
        </details>

        <details className="card" ref={sources}>
          <summary>Scientific sources and limitations</summary>
          {dashboard &&
            [
              ...new Map(
                dashboard.actions.map((a) => [a.source.url, a.source]),
              ).values(),
            ].map((source) => (
              <section key={source.url}>
                <h3>
                  <a href={source.url}>{source.title}</a>
                </h3>
                <p>{source.applicability}</p>
                <p>
                  {source.version} · {source.units}
                </p>
              </section>
            ))}
          {prevention &&
            prevention.officialSources.map((s) => (
              <section key={s.url}>
                <a href={s.url}>{s.title}</a>
                <p>{s.note}</p>
                {s.bulletins?.map((b) => (
                  <p key={b.url}>
                    <a href={b.url}>{b.label}</a> {b.dateEvidence}
                  </p>
                ))}
              </section>
            ))}
          {prevention && <p>{prevention.limitations}</p>}
        </details>
        <section
          className="card crop-loss-reminders"
          aria-labelledby="crop-loss-reminders-title"
        >
          <header className="crop-loss-reminders-header">
            <div>
              <h2 id="crop-loss-reminders-title">Prevention reminders</h2>
              <p>Checks to help protect your crop and stored produce.</p>
            </div>
            <span className="crop-loss-reminder-count">
              {reminders.filter((item) => !item.completedAt).length} pending
            </span>
          </header>
          {reminders.length === 0 ? (
            <p className="crop-loss-reminders-empty">
              No outstanding loss reminders.
            </p>
          ) : (
            <div className="crop-loss-reminder-list">
              {reminders.map((r) => {
                const text = reminderTextParts(r.message);
                const cropName =
                  r.cropName && r.cropName.toLowerCase() !== "unknown"
                    ? r.cropName
                    : null;
                const dueOn =
                  r.dueOn && r.dueOn.toLowerCase() !== "unknown"
                    ? r.dueOn
                    : null;
                const priority =
                  r.priority && r.priority.toLowerCase() !== "unknown"
                    ? r.priority
                    : null;
                return (
                  <article
                    className={`crop-loss-reminder${r.completedAt ? " is-completed" : ""}`}
                    key={r.id}
                  >
                    <div className="crop-loss-reminder-copy">
                      <div className="crop-loss-reminder-heading">
                        <p>{text.summary}</p>
                        <div className="crop-loss-reminder-badges">
                          {priority && (
                            <span
                              className="crop-loss-reminder-priority"
                              data-priority={priority.toLowerCase()}
                            >
                              {displayLabel(priority, locale)}
                            </span>
                          )}
                          <span
                            className="crop-loss-reminder-status"
                            data-completed={Boolean(r.completedAt)}
                          >
                            {r.completedAt
                              ? displayLabel("Completed", locale)
                              : displayLabel("Pending", locale)}
                          </span>
                        </div>
                      </div>
                      {text.details && (
                        <details className="crop-loss-reminder-details">
                          <summary>More details</summary>
                          <p>{text.details}</p>
                        </details>
                      )}
                      <div className="crop-loss-reminder-meta">
                        {cropName && <span>{cropText(cropName)}</span>}
                        {dueOn && (
                          <span>
                            <time dateTime={dueOn}>{dueOn.slice(0, 10)}</time>
                          </span>
                        )}
                      </div>
                    </div>
                    {!r.completedAt && (
                      <button
                        className="crop-loss-reminder-review"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const response = await fetch(
                              "/api/crop-loss/reminders",
                              {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: r.id }),
                              },
                            );
                            const d = await response.json();
                            if (!response.ok) throw Error(d.error);
                            setReminders((values) =>
                              values.map((v) =>
                                v.id === r.id
                                  ? {
                                      ...v,
                                      completedAt: new Date().toISOString(),
                                    }
                                  : v,
                              ),
                            );
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : "Update failed",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Mark reviewed
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ProtectionLanguage>
  );
}
