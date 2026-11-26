"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useProtectionText } from "@/i18n/crop-protection/client";
import { cropAdviceLabel } from "@/i18n/crop-advice";
import { indiaDateKey } from "@/lib/crop-cycle-status";
import type { HarvestTrackerEntry as CropItem } from "@/lib/harvest-tracker";
import { notifyHarvestUpdate, useHarvestData } from "../harvest-refresh";

export default function HarvestCenter({
  initialCycleId,
}: {
  initialCycleId: string;
}) {
  const t = useTranslations("Dashboard");
  const common = useTranslations("Common");
  const records = useTranslations("Records");
  const cropLabels = useTranslations("Crops");
  const locale = useLocale();
  const protectionText = useProtectionText();
  const { crops, state, refresh } = useHarvestData();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [openCycle, setOpenCycle] = useState(initialCycleId);
  useEffect(() => setOpenCycle(initialCycleId), [initialCycleId]);
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  });
  const date = (value: string | null) =>
    value ? formatter.format(new Date(`${value}T00:00:00Z`)) : t("notRecorded");
  const active = crops?.filter((crop) => crop.status !== "HARVESTED");
  const history = crops?.filter((crop) => crop.status === "HARVESTED");
  async function patch(payload: { cropCycleId: string }) {
    const response = await fetch("/api/harvests", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Action failed.");
    return body;
  }
  async function act(
    key: string,
    payload: { cropCycleId: string },
    message: string,
  ) {
    setBusy(key);
    setError("");
    try {
      const result = await patch(payload);
      notifyHarvestUpdate(payload.cropCycleId);
      const yieldText =
        typeof result.yieldPerAcre === "number"
          ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
              result.yieldPerAcre,
            ) + " kg/acre"
          : "";
      setToast([message, yieldText].filter(Boolean).join(" · "));
      window.setTimeout(() => setToast(""), 5000);
      return result;
    } catch (e) {
      setError(
        e instanceof Error ? protectionText(e.message) : common("error"),
      );
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
      cropLabels("harvestConfirmed"),
    );
    if (result) setOpenCycle("");
  }

  return (
    <main className="harvest-center">
      <header className="harvest-center-toolbar">
        <div>
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
      {state === "loading" && <p role="status">{common("loading")}</p>}
      {state === "offline" && <p role="status">{t("trackerOffline")}</p>}
      {state === "error" && (
        <div className="harvest-tracker-actions">
          <p role="alert">{t("trackerError")}</p>
          <button className="btn" type="button" onClick={() => void refresh()}>
            {t("trackerRetry")}
          </button>
        </div>
      )}
      {state === "live" && !active?.length && (
        <div className="panel">
          <p>{t("trackerEmpty")}</p>
          <Link className="btn" href="/crops#add-crop">
            {t("addCrop")}
          </Link>
        </div>
      )}
      {[
        { heading: t("harvestTracker"), entries: active },
        { heading: records("harvestRecords"), entries: history },
      ].map(({ heading, entries }) =>
        entries?.length ? (
          <section key={heading}>
            <h2>{heading}</h2>
            <div className="harvest-grid">
              {entries.map((cycle) => {
                const days = cycle.days;
                const status = cycle.status;
                const statusLabel =
                  status === "HARVESTED"
                    ? cropLabels("harvested")
                    : status === "READY"
                      ? t("readySoon")
                      : status === "DUE_TODAY"
                        ? t("dueToday")
                        : status === "OVERDUE"
                          ? t("overdue")
                          : status === "UPCOMING"
                            ? t("upcoming")
                            : t("dateNeeded");
                return (
                  <article
                    className="harvest-cycle-card"
                    key={cycle.id}
                    id={`harvest-${cycle.id}`}
                  >
                    <div className="harvest-cycle-top">
                      <h3>{cropAdviceLabel(cycle.crop, locale)}</h3>
                      <span
                        className={`harvest-status-pill ${status?.toLowerCase() ?? ""}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <div className="harvest-cycle-meta">
                      <span>
                        {cycle.farm} · {cycle.field}
                      </span>
                      <span>
                        {t("expectedHarvest")}: {date(cycle.date)}
                        {cycle.growthStage &&
                          ` · ${cropAdviceLabel(cycle.growthStage, locale)}`}
                      </span>
                      {cycle.expectedHarvestQuantity &&
                        cycle.expectedHarvestUnit && (
                          <span>
                            {records("quantity")}:{" "}
                            {cycle.expectedHarvestQuantity}{" "}
                            {cycle.expectedHarvestUnit}
                          </span>
                        )}
                    </div>
                    <strong className="harvest-countdown">
                      {status === "HARVESTED"
                        ? date(cycle.actualHarvestDate)
                        : days === null || days === 0
                          ? statusLabel
                          : days < 0
                            ? t("daysOverdue", { count: -days })
                            : days === 1
                              ? t("oneDayRemaining")
                              : t("daysRemaining", { count: days })}
                    </strong>
                    <div className="harvest-actions">
                      <Link
                        className="subtle-link"
                        href={`/crop-loss?cycle=${encodeURIComponent(cycle.id)}`}
                      >
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
                          {t("markHarvested")}
                        </button>
                      )}
                      <Link
                        className="subtle-link"
                        href={
                          status === null
                            ? `/crops?edit=${encodeURIComponent(cycle.id)}#cycle-${encodeURIComponent(cycle.id)}`
                            : cycle.href
                        }
                      >
                        {t(status === null ? "trackerEdit" : "viewCrop")}{" "}
                        <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                    </div>
                    {status !== "HARVESTED" && openCycle === cycle.id && (
                      <details open>
                        <summary>{records("recordHarvest")}</summary>
                        <form
                          className="harvest-confirm-form"
                          onSubmit={(event) => void submitHarvest(event, cycle)}
                        >
                          <div className="field">
                            <label htmlFor={`harvestDate-${cycle.id}`}>
                              {records("harvestDate")}
                            </label>
                            <input
                              type="date"
                              id={`harvestDate-${cycle.id}`}
                              name="harvestDate"
                              defaultValue={indiaDateKey(new Date())}
                              required
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`quantity-${cycle.id}`}>
                              {records("quantity")}
                            </label>
                            <input
                              type="number"
                              id={`quantity-${cycle.id}`}
                              name="quantity"
                              min="0.001"
                              step="0.001"
                              required
                            />
                            {cycle.expectedHarvestQuantity &&
                              cycle.expectedHarvestUnit && (
                                <small>
                                  {t("expectedHarvest")}:{" "}
                                  {cycle.expectedHarvestQuantity}{" "}
                                  {cycle.expectedHarvestUnit}
                                </small>
                              )}
                          </div>
                          <div className="field">
                            <label htmlFor={`unit-${cycle.id}`}>
                              {records("unit")}
                            </label>
                            <select
                              id={`unit-${cycle.id}`}
                              name="unit"
                              defaultValue={cycle.expectedHarvestUnit ?? "kg"}
                            >
                              {cycle.expectedHarvestUnit &&
                                ![
                                  "kg",
                                  "quintal",
                                  "tonne",
                                  "bag",
                                  "crate",
                                ].includes(cycle.expectedHarvestUnit) && (
                                  <option value={cycle.expectedHarvestUnit}>
                                    {cycle.expectedHarvestUnit}
                                  </option>
                                )}
                              <option>kg</option>
                              <option>quintal</option>
                              <option>tonne</option>
                              <option>bag</option>
                              <option>crate</option>
                            </select>
                          </div>
                          <div className="field">
                            <label>{protectionText("Quality / grade")}</label>
                            <input
                              name="quality"
                              maxLength={80}
                              placeholder={protectionText("Optional")}
                            />
                          </div>
                          <div className="field full">
                            <label>{protectionText("Storage details")}</label>
                            <input
                              name="storageDetails"
                              maxLength={1000}
                              placeholder={protectionText(
                                "Location, method or notes",
                              )}
                            />
                          </div>
                          <button
                            className="btn full"
                            type="submit"
                            disabled={busy === `harvest-${cycle.id}`}
                          >
                            {busy === `harvest-${cycle.id}`
                              ? common("loading")
                              : t("markHarvested")}
                          </button>
                        </form>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null,
      )}
    </main>
  );
}
