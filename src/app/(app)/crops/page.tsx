import HarvestUpdateNotice from "../harvest-update-notice";
import Link from "next/link";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { addCropCycle, updateCropCycle, deleteCropCycle } from "../../actions";
import { cropGrowthStages as growthStages } from "@/lib/crop-growth-stages";
import CropPicker from "./crop-picker";
import ConfirmDeleteCycle from "./confirm-delete-cycle";
import { getLocale, getTranslations } from "next-intl/server";
import { displayLabel } from "@/i18n/display-labels";
import {
  deriveCropCycleDisplayStatus,
  indiaDateKey,
} from "@/lib/crop-cycle-status";
import { expectedHarvestDate } from "@/lib/harvest";

export default async function Crops({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    harvestRevision?: string;
    edit?: string;
  }>;
}) {
  const user = await getUser();
  if (!user) return null;
  const t = await getTranslations("Crops");
  const locale = await getLocale();
  const today = indiaDateKey(new Date());
  const [fields, crops, cycles, query] = await Promise.all([
    db.field.findMany({
      where: { farm: { userId: user.id } },
      include: { farm: true },
      orderBy: { name: "asc" },
    }),
    db.crop.findMany({
      include: { climateRequirement: true },
      orderBy: { name: "asc" },
    }),
    db.cropCycle.findMany({
      where: { field: { farm: { userId: user.id } } },
      include: {
        crop: { include: { climateRequirement: true } },
        field: { include: { farm: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    searchParams,
  ]);
  const missingField = fields.length === 0;
  const missingCrops = crops.length === 0;
  const cropPickerOptions = crops.map((crop) => ({
    id: crop.id,
    name: crop.name,
    illustrative: crop.illustrative,
    climateRequirement: crop.climateRequirement
      ? { cropDurationDays: crop.climateRequirement.cropDurationDays }
      : null,
  }));

  return (
    <>
      <p className="muted">{t("subtitle")}</p>
      <h1 style={{ marginTop: 0 }}>{t("title")}</h1>
      {query.error && (
        <p role="alert" style={{ color: "#b42318" }}>
          {query.error ===
          "Confirm harvesting with the Mark as Harvested button"
            ? t("confirmHarvestError")
            : query.error.replaceAll("+", " ")}
        </p>
      )}
      <HarvestUpdateNotice revision={query.harvestRevision} />
      {query.saved && (
        <p role="status" style={{ color: "var(--green)" }}>
          {query.saved === "harvest-confirmed"
            ? t("harvestConfirmed")
            : query.saved.replaceAll("+", " ")}
        </p>
      )}

      {(missingField || missingCrops) && (
        <section
          className="panel"
          style={{ marginBottom: 18, borderColor: "#d9e6d6" }}
        >
          <h2 style={{ marginTop: 0 }}>{t("setupTitle")}</h2>
          <p className="muted">{t("setupNote")}</p>
          <ol style={{ display: "grid", gap: 12, paddingLeft: 22 }}>
            {missingField && (
              <li>
                <strong>{t("addField")}</strong>
                <div className="muted" style={{ margin: "4px 0 8px" }}>
                  {t("addFieldNote")}
                </div>
                <Link className="btn" href="/farms">
                  {t("openFarms")}
                </Link>
              </li>
            )}
            {missingCrops && (
              <li>
                <strong>{t("loadProfiles")}</strong>
                <div className="muted" style={{ margin: "4px 0 8px" }}>
                  {t("noCropRecords")}
                </div>
                <code
                  style={{
                    display: "inline-block",
                    background: "#f3f5f2",
                    borderRadius: 7,
                    padding: "8px 10px",
                  }}
                >
                  npm run db:seed
                </code>
              </li>
            )}
          </ol>
          {missingCrops && (
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              {t("demoNote")}
            </p>
          )}
        </section>
      )}

      <div className="split">
        <form id="add-crop" action={addCropCycle} className="panel">
          <h2 style={{ marginTop: 0 }}>{t("start")}</h2>
          {!missingField && !missingCrops ? (
            <>
              <Field label={t("field")}>
                <select name="fieldId" required>
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.farm.name} — {f.name}
                    </option>
                  ))}
                </select>
              </Field>
              <CropPicker crops={cropPickerOptions} />
              <Field label={t("season")}>
                <select name="season">
                  <option value="KHARIF">{t("kharif")}</option>
                  <option value="RABI">{t("rabi")}</option>
                  <option value="ZAID">{t("zaid")}</option>
                </select>
              </Field>
              <Field label={t("status")}>
                <select name="status">
                  <option value="PLANNED">{t("planned")}</option>
                  <option value="ACTIVE">{t("active")}</option>
                </select>
              </Field>
              <Field label={t("sowing")}>
                <input type="date" name="sowingDate" />
              </Field>
              <Field label={t("harvest")}>
                <input type="date" name="expectedHarvestDate" />
              </Field>
              <Field label={t("stage")}>
                <select name="growthStage">
                  <option value="">{t("notRecorded")}</option>
                  {growthStages.map((stage) => (
                    <option key={stage}>{stage}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("notes")}>
                <textarea name="notes" rows={2} />
              </Field>
              <button className="btn">{t("saveCycle")}</button>
            </>
          ) : (
            <p className="muted">{t("unavailable")}</p>
          )}
        </form>

        <section className="panel">
          <h2 style={{ marginTop: 0 }}>{t("cycles")}</h2>
          {cycles.length === 0 ? (
            <div className="muted">
              <p>{t("noCycles")}</p>
              <p>{t("cycleHint")}</p>
            </div>
          ) : (
            cycles.map((c) => {
              const calculatedDate = expectedHarvestDate(c);
              const calculatedStatus = deriveCropCycleDisplayStatus({
                ...c,
                expectedHarvestDate: calculatedDate,
              });
              const statusLabel = calculatedStatus
                ? t(calculatedStatus)
                : displayLabel(
                    c.status.charAt(0) + c.status.slice(1).toLowerCase(),
                    locale,
                  );
              const harvestAlert = getHarvestAlert(
                calculatedDate?.toISOString().slice(0, 10) ?? null,
                today,
                Boolean(c.actualHarvestDate),
              );
              const formatDate = (date: Date) =>
                new Date(
                  `${indiaDateKey(date)}T12:00:00.000Z`,
                ).toLocaleDateString(locale, {
                  timeZone: "UTC",
                  dateStyle: "medium",
                });
              return (
                <div
                  key={c.id}
                  id={`cycle-${c.id}`}
                  style={{
                    padding: "14px 0",
                    borderTop: "1px solid #edf0ec",
                    scrollMarginTop: 110,
                  }}
                >
                  <strong>{displayLabel(c.crop.name, locale)}</strong>
                  <span
                    style={{
                      marginLeft: 10,
                      fontSize: 12,
                      color: "var(--green)",
                    }}
                  >
                    {statusLabel}
                  </span>
                  <span className={`crop-cycle-alert ${harvestAlert.severity}`}>
                    {harvestAlert.label}
                  </span>
                  <p className="muted" style={{ margin: "6px 0" }}>
                    {c.field.farm.name} · {c.field.name} ·{" "}
                    {displayLabel(
                      c.season.charAt(0) + c.season.slice(1).toLowerCase(),
                      locale,
                    )}
                  </p>
                  <small className="muted">
                    {t("sowing")}:{" "}
                    {c.sowingDate ? formatDate(c.sowingDate) : t("notRecorded")}{" "}
                    · {t("plannedHarvest")}:{" "}
                    {calculatedDate
                      ? formatDate(calculatedDate)
                      : t("notRecorded")}
                    {!c.expectedHarvestDate &&
                    (c.cropDurationDays ??
                      c.crop.climateRequirement?.cropDurationDays)
                      ? " · estimated from crop duration and growth stage"
                      : ""}
                  </small>
                  {c.actualHarvestDate && (
                    <p className="muted" style={{ margin: "5px 0 0" }}>
                      {t("actualHarvest")}: {formatDate(c.actualHarvestDate)}
                    </p>
                  )}
                  {!c.actualHarvestDate && (
                    <Link
                      className="btn"
                      style={{ marginTop: 10 }}
                      href={`/harvests?cropCycleId=${encodeURIComponent(c.id)}`}
                    >
                      Open harvest confirmation
                    </Link>
                  )}
                  <details
                    open={query.edit === c.id || undefined}
                    style={{ marginTop: 10 }}
                  >
                    <summary
                      style={{
                        color: "var(--green)",
                        cursor: "pointer",
                        fontWeight: 650,
                      }}
                    >
                      {t("edit")}
                    </summary>
                    <form action={updateCropCycle} style={{ marginTop: 10 }}>
                      <input type="hidden" name="id" value={c.id} />
                      <Field label={t("field")}>
                        <select
                          name="fieldId"
                          defaultValue={c.fieldId}
                          required
                        >
                          {fields.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.farm.name} — {f.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("crop")}>
                        <select name="cropId" defaultValue={c.cropId} required>
                          {crops.map((crop) => (
                            <option key={crop.id} value={crop.id}>
                              {displayLabel(crop.name, locale)}
                              {crop.illustrative
                                ? ` · ${t("demoProfile")}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("season")}>
                        <select name="season" defaultValue={c.season}>
                          <option value="KHARIF">{t("kharif")}</option>
                          <option value="RABI">{t("rabi")}</option>
                          <option value="ZAID">{t("zaid")}</option>
                        </select>
                      </Field>
                      <Field label={t("status")}>
                        <select name="status" defaultValue={c.status}>
                          <option value="PLANNED">{t("planned")}</option>
                          <option value="ACTIVE">{t("active")}</option>
                          {c.status === "HARVESTED" && (
                            <option value="HARVESTED">
                              {t("harvestCompleted")}
                            </option>
                          )}
                          <option value="COMPLETED">{t("completed")}</option>
                        </select>
                      </Field>
                      <Field label={t("sowing")}>
                        <input
                          type="date"
                          name="sowingDate"
                          defaultValue={
                            c.sowingDate?.toISOString().slice(0, 10) ?? ""
                          }
                        />
                      </Field>
                      <Field label={t("harvest")}>
                        <input
                          type="date"
                          name="expectedHarvestDate"
                          defaultValue={
                            c.expectedHarvestDate?.toISOString().slice(0, 10) ??
                            ""
                          }
                        />
                      </Field>
                      <Field label="Crop duration (days)">
                        <input
                          type="number"
                          name="cropDurationDays"
                          min="1"
                          max="730"
                          step="1"
                          defaultValue={
                            c.cropDurationDays ??
                            c.crop.climateRequirement?.cropDurationDays ??
                            ""
                          }
                          placeholder="Enter if known"
                        />
                      </Field>
                      <Field label={t("stage")}>
                        <select
                          name="growthStage"
                          defaultValue={c.growthStage ?? ""}
                        >
                          <option value="">{t("notRecorded")}</option>
                          {growthStages.map((stage) => (
                            <option key={stage}>{stage}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("notes")}>
                        <textarea
                          name="notes"
                          rows={2}
                          defaultValue={c.notes ?? ""}
                        />
                      </Field>
                      <button className="btn">{t("saveChanges")}</button>
                    </form>
                  </details>
                  <form action={deleteCropCycle} style={{ marginTop: 9 }}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmDeleteCycle confirmation={t("deleteConfirm")} />
                  </form>
                </div>
              );
            })
          )}
        </section>
      </div>
    </>
  );
}

function getHarvestAlert(
  date: string | null,
  today: string,
  harvested: boolean,
) {
  if (harvested)
    return { severity: "green" as const, label: "Harvest completed" };
  if (!date)
    return { severity: "neutral" as const, label: "Harvest date missing" };
  const days = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  if (days < 0)
    return {
      severity: "red" as const,
      label: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`,
    };
  if (days === 0) return { severity: "amber" as const, label: "Due today" };
  if (days <= 7)
    return {
      severity: "amber" as const,
      label: `Due in ${days} day${days === 1 ? "" : "s"}`,
    };
  return { severity: "green" as const, label: `On track · ${days} days left` };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
