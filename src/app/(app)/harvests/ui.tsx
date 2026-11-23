"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {useProtectionText} from "@/i18n/crop-protection/client";

type CropItem = {
  id: string;
  crop: string;
  field: string;
  farm: string;
  growthStage: string | null;
  date: string | null;
  actualHarvestDate: string | null;
  expectedHarvestQuantity: string | null;
  expectedHarvestUnit: string | null;
  status: string | null;
  href: string;
};
type Data = {
  crops: CropItem[];
};
const statusText: Record<string, string> = {
  UPCOMING: "Upcoming",
  READY: "Ready soon",
  DUE_TODAY: "Due today",
  OVERDUE: "Overdue",
  HARVESTED: "Harvested",
};
function daysUntil(date: string | null) {
  if (!date) return null;
  const now = new Date();
  const indiaNow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${indiaNow}T00:00:00Z`)) /
      86_400_000,
  );
}
function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export default function HarvestCenter({
  initialCycleId,
}: {
  initialCycleId: string;
}) {
  const t = useTranslations("Dashboard");
  const protectionText = useProtectionText();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [openCycle, setOpenCycle] = useState(initialCycleId);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/harvests", {
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error ||
            `Could not load harvest data (HTTP ${response.status}).`,
        );
      }
      const next = (await response.json()) as Data;
      setData(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load harvest data.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function patch(payload: object) {
    const response = await fetch("/api/harvests", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Action failed.");
    return body;
  }
  async function act(key: string, payload: object, message: string) {
    setBusy(key);
    setError("");
    try {
      const result = await patch(payload);
      if (key.startsWith("harvest-")) {
        const update = { cropCycleId: (payload as { cropCycleId?: string }).cropCycleId };
        window.dispatchEvent(new CustomEvent("agritrack:harvest-updated", { detail: update }));
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("agritrack-harvest");
          channel.postMessage(update);
          channel.close();
        }
      }
      setToast(message);
      await refresh();
      window.setTimeout(() => setToast(""), 5000);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }
  async function submitHarvest(
    event: React.FormEvent<HTMLFormElement>,
    cycle: CropItem,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      action: "harvested",
      cropCycleId: cycle.id,
      harvestDate: String(form.get("harvestDate")),
      quantity: Number(form.get("quantity")),
      unit: String(form.get("unit")),
      quality: String(form.get("quality") || ""),
      storageDetails: String(form.get("storageDetails") || ""),
    };
    const result = await act(
      `harvest-${cycle.id}`,
      payload,
      "Harvest recorded. Crop status and stock history have been updated.",
    );
    if (result?.yieldPerAcre !== null && result?.yieldPerAcre !== undefined)
      setToast(
        `Harvest recorded. Calculated yield: ${Number(result.yieldPerAcre).toFixed(2)} kg/acre.`,
      );
    setOpenCycle("");
  }
  return (
    <main className="harvest-center">
      <header className="harvest-center-toolbar">
        <div>
          <p className="muted" style={{ margin: "0 0 7px", fontSize: 11 }}>
            Live crop countdowns and harvest records
          </p>
          <h1>{t("harvestAlert")}</h1>
        </div>
      </header>
      {error && (
        <p role="alert" className="harvest-error">
          {error}
        </p>
      )}
      {toast && (
        <p role="status" className="harvest-success">
          {toast}
        </p>
      )}
      <section>
        <div className="dashboard-section-title">
          <div>
            <p className="eyebrow">CROP CALENDAR</p>
            <h2>Countdowns</h2>
          </div>
        </div>
        {!data?.crops.length ? (
          <div className="panel muted">
            Add crop cycles, sowing dates and an expected date or crop duration
            to see a harvest countdown.{" "}
            <Link className="subtle-link" href="/crops">
              Open crop calendar <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="harvest-grid">
            {data.crops.map((cycle) => {
              const days = daysUntil(cycle.date);
              const status = cycle.status ?? "UPCOMING";
              return (
                <article
                  className="harvest-cycle-card"
                  key={cycle.id}
                  id={`harvest-${cycle.id}`}
                >
                  <div className="harvest-cycle-top">
                    <h3>{cycle.crop}</h3>
                    <span
                      className={`harvest-status-pill ${status.toLowerCase()}`}
                    >
                      {statusText[status] ?? status}
                    </span>
                  </div>
                  <div className="harvest-cycle-meta">
                    <span>
                      {cycle.farm} · {cycle.field}
                    </span>
                    <span>
                      Expected:{" "}
                      {cycle.date ?? "Add a duration or expected date"}
                      {cycle.growthStage
                        ? ` · estimated from ${cycle.growthStage} stage`
                        : ""}
                    </span>
                    {cycle.expectedHarvestQuantity&&cycle.expectedHarvestUnit&&<span>
                      Expected quantity: {cycle.expectedHarvestQuantity} {cycle.expectedHarvestUnit}
                    </span>}
                  </div>
                  <strong className="harvest-countdown">
                    {status === "HARVESTED"
                      ? `Harvested ${cycle.actualHarvestDate ?? ""}`
                      : days === null
                        ? "Date needed"
                        : days > 1
                          ? `${days} days remaining`
                          : days === 1
                            ? "1 day remaining"
                            : days === 0
                              ? "Due today"
                              : `${Math.abs(days)} days overdue`}
                  </strong>
                  <div className="harvest-actions">
                    <Link className="subtle-link" href={`/crop-loss?cycle=${encodeURIComponent(cycle.id)}`}>
                      {protectionText("Harvest loss and prevention")}
                    </Link>
                    {status !== "HARVESTED" && (
                      <button
                        className="btn"
                        type="button"
                        onClick={() =>
                          setOpenCycle(openCycle === cycle.id ? "" : cycle.id)
                        }
                      >
                        Mark as harvested
                      </button>
                    )}
                    <Link className="subtle-link" href={cycle.href}>
                      View crop <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                  {status !== "HARVESTED" && openCycle === cycle.id && (
                    <details open>
                      <summary>Harvest details</summary>
                      <form
                        className="harvest-confirm-form"
                        onSubmit={(event) => void submitHarvest(event, cycle)}
                      >
                        <div className="field">
                          <label>Actual harvest date</label>
                          <input
                            type="date"
                            name="harvestDate"
                            defaultValue={todayInIndia()}
                            required
                          />
                        </div>
                        <div className="field">
                          <label>Actual harvest quantity</label>
                          <input
                            type="number"
                            name="quantity"
                            min="0.001"
                            step="0.001"
                            required
                          />
                          {cycle.expectedHarvestQuantity&&cycle.expectedHarvestUnit&&<small>Saved plan: {cycle.expectedHarvestQuantity} {cycle.expectedHarvestUnit}. Enter the measured actual amount here.</small>}
                        </div>
                        <div className="field">
                          <label>Actual harvest unit</label>
                          <select name="unit" defaultValue={cycle.expectedHarvestUnit??"kg"}>
                            {cycle.expectedHarvestUnit&&!['kg','quintal','tonne','bag','crate'].includes(cycle.expectedHarvestUnit)&&<option value={cycle.expectedHarvestUnit}>{cycle.expectedHarvestUnit}</option>}
                            <option>kg</option>
                            <option>quintal</option>
                            <option>tonne</option>
                            <option>bag</option>
                            <option>crate</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Quality / grade</label>
                          <input
                            name="quality"
                            maxLength={80}
                            placeholder="Optional"
                          />
                        </div>
                        <div className="field full">
                          <label>Storage details</label>
                          <input
                            name="storageDetails"
                            maxLength={1000}
                            placeholder="Location, method or notes"
                          />
                        </div>
                        <button
                          className="btn full"
                          type="submit"
                          disabled={busy === `harvest-${cycle.id}`}
                        >
                          {busy === `harvest-${cycle.id}`
                            ? "Saving…"
                            : "Confirm harvest"}
                        </button>
                      </form>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
