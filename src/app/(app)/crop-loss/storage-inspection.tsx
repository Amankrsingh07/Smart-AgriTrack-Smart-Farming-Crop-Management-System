"use client";

import { storageSources } from "@/data/agriculture/storage-references";
import type { Reminder } from "./ui";
import { useState } from "react";
import { ProtectionLanguage } from "@/i18n/crop-protection/client";
import { indiaDateKey } from "@/lib/crop-cycle-status";
import {
  storageCrop,
  storageMoistureGuideline,
  storageReferenceVersion,
  type Inspection,
  type SavedInspection,
} from "@/lib/crop-loss-storage";

export function StorageInspectionForm({
  lot,
  onSaved,
}: {
  lot: {
    id: string;
    crop: string;
    harvestDate: string;
    storageDetails?: string | null;
    harvested?: string;
    sold?: string;
    unit?: string;
    storageInspections: SavedInspection[];
  };
  onSaved: (reminders?: Reminder[]) => Promise<void>;
}) {
  const latest = lot.storageInspections[0];
  const [date, setDate] = useState(
    latest?.inspectedOn.slice(0, 10) ?? indiaDateKey(new Date()),
  );
  const [measures, setMeasures] = useState({
    moisture: latest?.findings.moisture?.toString() ?? "",
    temperature: latest?.findings.temperature?.toString() ?? "",
    humidity: latest?.findings.humidity?.toString() ?? "",
  });
  const [pests, setPests] = useState<Inspection["pests"]>(
    latest?.findings.pests ?? "Unknown",
  );
  const [mold, setMold] = useState<Inspection["mold"]>(
    latest?.findings.mold ?? "Unknown",
  );
  const [condition, setCondition] = useState<Inspection["condition"]>(
    latest?.findings.condition ?? "Unknown",
  );
  const [extra, setExtra] = useState({
    pestType: latest?.findings.pestType ?? "",
    symptoms: latest?.findings.symptoms ?? "",
    durationDays: latest?.findings.durationDays?.toString() ?? "",
    severity: latest?.findings.severity ?? "Unknown",
    disease: latest?.findings.disease ?? "Unknown",
    ventilation: latest?.findings.ventilation ?? "Unknown",
    leakage: latest?.findings.leakage ?? "Unknown",
    storageType: latest?.findings.storageType ?? "Unknown",
  });
  const updateExtra = (key: keyof typeof extra, value: string) =>
    setExtra((previous) => ({ ...previous, [key]: value }));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const ambiguousRice = storageCrop(lot.crop) === "rice";
  const [commodityForm, setCommodityForm] = useState<
    NonNullable<Inspection["commodityForm"]> | ""
  >(latest?.findings.commodityForm ?? "");
  const commodity = storageCrop(lot.crop, commodityForm || undefined);
  const moistureGuideline = storageMoistureGuideline(
    commodity,
    extra.durationDays.trim() === "" ? null : Number(extra.durationDays),
  );
  const reference = moistureGuideline.reference;
  const fields = [
    ["moisture", "Grain moisture (wet basis %)"],
    ["temperature", "Indoor temperature (°C)"],
    ["humidity", "Indoor relative humidity (%)"],
  ] as const;
  const observations = ["Unknown", "Observed", "None observed"] as const;
  return (
    <ProtectionLanguage>
      <section className="card">
        <h2>Storage inspection</h2>
        <p>Leave unmeasured readings blank.</p>
        {lot.harvested && (
          <p>
            {lot.crop} · {lot.harvestDate} · {lot.harvested} {lot.unit}{" "}
            harvested
            {lot.sold != null && (
              <>
                {" "}
                · {lot.sold} {lot.unit} sold
              </>
            )}
            {" · "}
            <a href="/inventory">Inventory</a>
          </p>
        )}
        {lot.storageDetails && (
          <p>
            <strong>Saved storage notes</strong> ·{" "}
            <span data-protection-raw>{lot.storageDetails}</span>
          </p>
        )}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            setBusy(true);
            setStatus("");
            const number = (value: string) =>
              value.trim() === "" ? null : Number(value);
            try {
              const body = new FormData(form);
              body.delete("attachments");
              const files =
                (form.elements.namedItem("attachments") as HTMLInputElement)
                  .files ?? [];
              for (const file of files) body.append("attachments", file);
              body.set(
                "inspection",
                JSON.stringify({
                  productionId: lot.id,
                  version: latest?.version ?? 0,
                  inspectedOn: date,
                  findings: {
                    ...extra,
                    commodityForm: ambiguousRice
                      ? commodityForm || undefined
                      : undefined,
                    pestType: extra.pestType.trim() || undefined,
                    symptoms: extra.symptoms.trim() || undefined,
                    durationDays: number(extra.durationDays) ?? undefined,
                    moisture: number(measures.moisture),
                    temperature: number(measures.temperature),
                    humidity: number(measures.humidity),
                    pests,
                    mold,
                    condition,
                  },
                }),
              );
              const response = await fetch("/api/crop-loss/inspections", {
                method: "POST",
                body,
              });
              const result = await response.json();
              if (!response.ok) throw Error(result.error);
              await onSaved(result.reminders);
              (
                form.elements.namedItem("attachments") as HTMLInputElement
              ).value = "";
              setStatus("Storage inspection saved.");
            } catch (error) {
              setStatus(
                error instanceof Error && !(error instanceof TypeError)
                  ? error.message
                  : "Storage inspection unavailable.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="fertilizer-grid">
            <label>
              Inspection date
              <input
                required
                type="date"
                value={date}
                min={lot.harvestDate}
                max={indiaDateKey(new Date())}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            {ambiguousRice && (
              <label>
                Rice form
                <select
                  value={commodityForm}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCommodityForm(
                      value === "paddy" || value === "milled rice" ? value : "",
                    );
                  }}
                >
                  <option value="">Unknown</option>
                  <option value="paddy">Paddy</option>
                  <option value="milled rice">Milled rice</option>
                </select>
              </label>
            )}
            {fields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  step="any"
                  min={key === "temperature" ? -273.15 : 0}
                  max={key === "temperature" ? undefined : 100}
                  value={measures[key]}
                  onChange={(event) =>
                    setMeasures((previous) => ({
                      ...previous,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <label>
              Pest infestation
              <select
                value={pests}
                onChange={(event) =>
                  setPests(event.target.value as Inspection["pests"])
                }
              >
                {observations.map((value) => (
                  <option key={value} value={value}>
                    {value === "Observed"
                      ? "Yes"
                      : value === "None observed"
                        ? "No"
                        : value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Visible mold
              <select
                value={mold}
                onChange={(event) =>
                  setMold(event.target.value as Inspection["mold"])
                }
              >
                {observations.map((value) => (
                  <option key={value} value={value}>
                    {value === "Observed"
                      ? "Yes"
                      : value === "None observed"
                        ? "No"
                        : value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Storage condition
              <select
                value={condition}
                onChange={(event) =>
                  setCondition(event.target.value as Inspection["condition"])
                }
              >
                {(
                  [
                    "Unknown",
                    "Good",
                    "Moderate",
                    "Poor",
                    ...(["Clean and dry", "Damp or damaged"] as const).filter(
                      (value) => value === latest?.findings.condition,
                    ),
                  ] as const
                ).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pest type
              <input
                maxLength={120}
                value={extra.pestType}
                onChange={(event) =>
                  updateExtra("pestType", event.target.value)
                }
              />
            </label>
            <label>
              Symptoms and evidence
              <textarea
                maxLength={500}
                value={extra.symptoms}
                onChange={(event) =>
                  updateExtra("symptoms", event.target.value)
                }
              />
            </label>
            <label>
              Storage duration (days)
              <input
                type="number"
                min={0}
                max={36500}
                step={1}
                value={extra.durationDays}
                onChange={(event) =>
                  updateExtra("durationDays", event.target.value)
                }
              />
            </label>
            {(
              [
                [
                  "severity",
                  "Infestation severity",
                  ["Unknown", "Mild", "Moderate", "Severe"],
                ],
                ["disease", "Disease symptoms", observations],
                [
                  "storageType",
                  "Storage type",
                  [
                    "Unknown",
                    "Warehouse",
                    "Silo",
                    "Bags",
                    "Traditional storage",
                  ],
                ],
                [
                  "ventilation",
                  "Ventilation condition",
                  ["Unknown", "Good", "Moderate", "Poor"],
                ],
                ["leakage", "Water leakage", observations],
              ] as const
            ).map(([key, label, choices]) => (
              <label key={key}>
                {label}
                <select
                  value={extra[key]}
                  onChange={(event) => updateExtra(key, event.target.value)}
                >
                  {choices.map((value) => (
                    <option key={value} value={value}>
                      {value === "Observed"
                        ? "Yes"
                        : value === "None observed"
                          ? "No"
                          : value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label>
            Inspection photographs and laboratory reports
            <input
              name="attachments"
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              multiple
            />
          </label>
          <button className="btn" disabled={busy}>
            Save storage inspection
          </button>
          <p role="status">{status}</p>
        </form>
        {reference ? (
          <details>
            <summary>Storage reference</summary>
            <p>
              <a href={reference.source}>Open source</a> ·{" "}
              {storageReferenceVersion}
            </p>
            <dl>
              <dt>Reference storage duration</dt>
              <dd>{reference.duration}</dd>
              <dt>Moisture guideline</dt>
              <dd>
                {moistureGuideline.available
                  ? `${reference.strictMaximum ? "<" : "≤"} ${reference.moisture}% wet basis`
                  : `Guideline unavailable. ${moistureGuideline.reason}`}
              </dd>
              <dt>Guideline source</dt>
              <dd>
                <a href={reference.source}>Open source</a>
              </dd>
              {reference.temperature !== null && (
                <>
                  <dt>Reference temperature</dt>
                  <dd>{reference.temperature} °C</dd>
                </>
              )}
              {reference.humidity !== null && (
                <>
                  <dt>Reference relative humidity</dt>
                  <dd>{reference.humidity}%</dd>
                </>
              )}
            </dl>
            <p>
              These values describe one published storage scenario. Automatic
              moisture comparison uses the crop and the storage duration
              recorded above. Unknown or incompatible scope requires inspection.
            </p>
          </details>
        ) : (
          <p>
            {ambiguousRice
              ? "Select whether the lot contains paddy or milled rice."
              : moistureGuideline.reason}
          </p>
        )}
        {["wheat", "paddy", "milled rice"].includes(commodity) && (
          <p>
            <a href={storageSources.fci}>
              FCI · grain moisture and indoor conditions
            </a>
            {commodity !== "paddy" && (
              <>
                {" "}
                ·{" "}
                <a href={storageSources.icarStorageSop}>
                  DFPD · ICAR storage study guidance
                </a>
              </>
            )}
          </p>
        )}
        {latest && (
          <details>
            <summary>Storage inspection history</summary>
            {lot.storageInspections.map((row) => (
              <section key={row.version}>
                <h3>
                  <time dateTime={row.inspectedOn}>
                    {row.inspectedOn.slice(0, 10)}
                  </time>{" "}
                  · {row.version}
                </h3>
                <dl>
                  {fields.map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{row.findings[key] ?? "Not recorded"}</dd>
                    </div>
                  ))}
                  <dt>Pest infestation</dt>
                  <dd>{row.findings.pests}</dd>
                  <dt>Visible mold</dt>
                  <dd>{row.findings.mold}</dd>
                  <dt>Storage condition</dt>
                  <dd>{row.findings.condition}</dd>
                  <dt>Storage type</dt>
                  <dd>{row.findings.storageType ?? "Unknown"}</dd>
                  <dt>Storage duration (days)</dt>
                  <dd>{row.findings.durationDays ?? "Unknown"}</dd>
                  <dt>Ventilation condition</dt>
                  <dd>{row.findings.ventilation ?? "Unknown"}</dd>
                  <dt>Water leakage</dt>
                  <dd>{row.findings.leakage ?? "Unknown"}</dd>
                  <dt>Pest type</dt>
                  <dd data-protection-raw>{row.findings.pestType}</dd>
                  <dt>Infestation severity</dt>
                  <dd>{row.findings.severity ?? "Unknown"}</dd>
                  <dt>Disease symptoms</dt>
                  <dd>{row.findings.disease ?? "Unknown"}</dd>
                  {row.findings.symptoms && (
                    <>
                      <dt>Symptoms and evidence</dt>
                      <dd data-protection-raw>{row.findings.symptoms}</dd>
                    </>
                  )}
                </dl>
                {row.attachments?.map((file) => (
                  <p key={file.id}>
                    <a
                      data-protection-raw
                      href={`/api/crop-loss/inspections/attachments/${encodeURIComponent(file.id)}`}
                    >
                      {file.filename}
                    </a>
                  </p>
                ))}
              </section>
            ))}
          </details>
        )}
      </section>
    </ProtectionLanguage>
  );
}
