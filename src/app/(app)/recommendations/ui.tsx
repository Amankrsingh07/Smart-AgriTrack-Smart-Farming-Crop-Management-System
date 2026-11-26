"use client";

import { soilText } from "@/i18n/soil-health";
import FarmerAdviceCard from "../farmer-advice-card";
import { useState } from "react";
import { useLocale } from "next-intl";
import { cropAdviceText, cropAdviceLabel } from "@/i18n/crop-advice";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  Bug,
  CalendarDays,
  CloudRain,
  Droplets,
  FlaskConical,
  PackageCheck,
  Sprout,
  Wheat,
} from "lucide-react";
import { fieldAdviceText } from "@/i18n/crop-advice/field";
import type { savedCropWaterDemand } from "@/lib/saved-crop-water-demand";
import type { fieldAdvice } from "@/lib/field-advice";
import references from "@/data/agriculture/field-advice.json";
import type { SavedSoilAdvice } from "@/lib/saved-crop-soil-advice";
import type { WaterMeasureValue } from "@/lib/crop-water";

type SavedCrop = {
  demand: ReturnType<typeof savedCropWaterDemand>;
  growing: boolean;
  variety: string | null;
  actualHarvest: string | null;
  lastWatering: string | null;
  lastFertilizer: string | null;
  id: string;
  name: string;
  fieldId: string;
  field: string;
  farm: string;
  state: string;
  district: string;
  soil: string;
  availableWater: string;
  area: string;
  season: string;
  status: string;
  stage: string | null;
  sowing: string | null;
  harvest: string | null;
  harvestEstimated: boolean;
  duration: number | null;
  descriptionSource: string | null;
  soilAdvice: SavedSoilAdvice;
  description: string | null;
  illustrative: boolean;
  soils: string[];
  seasons: string[];
  waterNeed: string;
  water: (WaterMeasureValue & {
    method: string | null;
    scope: string | null;
  })[];
  advice: ReturnType<typeof fieldAdvice>;
  rain: number | null;
  soilSample: string | null;
  stageDate: string | null;
  protectionDate: string | null;
  protectionConcern: boolean;
  stageSource?: string;
  hasLowNutrients: boolean;
  ageDays: number | null;
  stageBasis: string;
  stageConfirmedAt: string | null;
  stageReference: string | null;
  stageReferenceUrl: string | null;
  stageScope: string | null;
  overdueHarvest: boolean;
  locationSuitability: {
    notes: string | null;
    source: string | null;
    url: string | null;
    state: string;
    district: string | null;
    season: string;
  } | null;
  scheduledTasks: {
    topic: string;
    title: string;
    date: string | null;
    completedDate: string | null;
    done: boolean;
    source: string | null;
    sourceUrl: string | null;
    updated: string | null;
  }[];
  npkStatus: {
    name: string;
    value: number | null;
    unit: string;
    basis: string;
    rating: string;
    method: string;
    sourceUrl?: string | null;
    sampleDate: string | null;
    reason: string | null;
    band?: string | null;
    sourceName?: string | null;
  }[];
  microReadings: {
    name: string;
    value: number;
    unit: string;
    date: string | undefined | null;
    interpretation: string;
  }[];
  weatherInfo: {
    currentAt: string;
    currentTemp: number;
    currentHumidity: number;
    currentRain: number;
    forecastDate: string | null;
    forecastLow: number | null;
    forecastHigh: number | null;
    forecastRain: number | null;
    rainChance: number | null;
    source: string;
  } | null;
  risks: { name: string; source: string; reviewed: string }[];
  lossHref: string;
  farmId: string;
  soilGuidance: {
    soil: string;
    notes: string | null;
    fertilizer: string | null;
    minPh: number | null;
    maxPh: number | null;
    source: string | null;
    url: string | null;
  }[];
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .trim();

type Topic = SavedCrop["advice"]["tasks"][number]["topic"];
const icons = {
  protection: Bug,
  weather: CloudRain,
  harvest: Wheat,
  loss: PackageCheck,
  irrigation: Droplets,
  fertilizer: FlaskConical,
  calendar: CalendarDays,
};
function topicHref(crop: SavedCrop, topic: Topic) {
  const cycle = encodeURIComponent(crop.id);
  return {
    protection: crop.protectionConcern
      ? `/harvests?cropCycleId=${cycle}#protection-${cycle}`
      : crop.lossHref,
    harvest: `/harvests?cropCycleId=${cycle}#harvest-${cycle}`,
    weather: `/weather?farmId=${encodeURIComponent(crop.farmId)}`,
    loss: crop.lossHref,
    irrigation: `/irrigation?cycle=${cycle}`,
    fertilizer: `/fertilizer-recommendation?cycle=${cycle}`,
    calendar: `/crop-calendar?cycle=${cycle}`,
  }[topic];
}

export default function CropAdvice({
  crops,
  today,
}: {
  crops: SavedCrop[];
  today: string;
}) {
  const locale = useLocale();
  const t = (text: string, values?: Record<string, string | number>) =>
    cropAdviceText(text, locale, values);
  const waterText =
    locale === "hi"
      ? {
          demand: "फसल की अनुमानित पानी की ज़रूरत",
          missing: "पर्याप्त जानकारी उपलब्ध नहीं है।",
          measure:
            "सिंचाई की मात्रा और समय तय करने से पहले मिट्टी की नमी जाँचें।",
          forecast: "Open-Meteo पूर्वानुमान",
          normal: "जिले का ऐतिहासिक जलवायु औसत",
          completed: "कटाई की तारीख",
          assistant: "फसल सहायक",
          lastWatering: "पिछली दर्ज सिंचाई",
          lastFertilizer: "पिछली दर्ज खाद",
          assumptions:
            "यह सामान्य फसल दशाओं का अनुमान है। इसमें बारिश की कटौती शामिल नहीं है।",
        }
      : {
          demand: "Estimated crop water demand",
          missing: "Insufficient data for the saved crop stage and location.",
          measure:
            "Check root-zone moisture before deciding when and how much to irrigate.",
          forecast: "Open-Meteo forecast",
          normal: "Historical district climate normal",
          completed: "Actual harvest date",
          assistant: "Crop assistant",
          lastWatering: "Last recorded watering",
          lastFertilizer: "Last recorded fertilizer application",
          assumptions:
            "This estimate assumes standard crop conditions and includes no rainfall deduction.",
        };
  const short = (key: Parameters<typeof fieldAdviceText>[1]) =>
    fieldAdviceText(locale, key);
  const [online, setOnline] = useState<
    Record<
      string,
      { locale?: string; mode: string; message: string; tips?: string[] }
    >
  >({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  async function explain(crop: SavedCrop) {
    setLoading((previous) => ({ ...previous, [crop.id]: true }));
    try {
      if (!navigator.onLine)
        throw new Error(
          t("You are offline. Showing the bundled soil reference."),
        );
      const response = await fetch("/api/crop-soil-advice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cropCycleId: crop.id, locale }),
        signal: AbortSignal.timeout(25_000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(t(data.error || "Online explanation is unavailable."));
      setOnline((previous) => ({
        ...previous,
        [crop.id]: { ...data, message: t(data.message), locale },
      }));
    } catch {
      setOnline((previous) => ({
        ...previous,
        [crop.id]: {
          mode: "offline",
          locale,
          message: t(
            "Online explanation unavailable. Showing the offline reference.",
          ),
        },
      }));
    } finally {
      setLoading((previous) => ({ ...previous, [crop.id]: false }));
    }
  }
  const [fieldId, setFieldId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const fields = [
    ...new Map(crops.map((crop) => [crop.fieldId, crop])).values(),
  ];
  const available = crops.filter(
    (crop) => !fieldId || crop.fieldId === fieldId,
  );
  const shown = available.filter((crop) => !cycleId || crop.id === cycleId);
  const actions = shown
    .flatMap((crop) =>
      crop.advice.tasks.flatMap((task) => {
        const taskIsTracked =
          ["irrigation", "fertilizer", "calendar"].includes(task.topic) &&
          crop.scheduledTasks.some(
            (saved) =>
              saved.topic === task.topic && saved.date === today && !saved.done,
          );
        if (
          task.priority === null ||
          taskIsTracked ||
          (task.topic === "harvest" && crop.overdueHarvest)
        )
          return [];
        return [{ crop, ...task, priority: task.priority }];
      }),
    )
    .sort((a, b) => a.priority - b.priority);
  const upcomingEnd = new Date(
    Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  const scheduled = shown.flatMap((crop) =>
    crop.scheduledTasks.map((task) => ({ crop, task })),
  );
  const taskGroups = [
    {
      key: "overdue",
      label: short("overdue"),
      rows: scheduled.filter(
        ({ task }) => !task.done && task.date && task.date < today,
      ),
    },
    {
      key: "today",
      label: short("dueToday"),
      rows: scheduled.filter(({ task }) => !task.done && task.date === today),
    },
    {
      key: "upcoming",
      label: short("upcoming"),
      rows: scheduled.filter(
        ({ task }) =>
          !task.done &&
          task.date &&
          task.date > today &&
          task.date <= upcomingEnd,
      ),
    },
    {
      key: "completed",
      label: short("completed"),
      rows: scheduled.filter(({ task }) => task.done),
    },
  ];
  const overdueRows = taskGroups.find((group) => group.key === "overdue")!.rows;
  const overdueByTopic = new Map<string, typeof overdueRows>();
  for (const row of overdueRows) {
    const key = `${row.crop.id}:${row.task.topic}`;
    overdueByTopic.set(key, [...(overdueByTopic.get(key) ?? []), row]);
  }
  const overdueCards = [...overdueByTopic.values()].map((rows) => ({
    crop: rows[0].crop,
    topic: rows[0].task.topic,
    rows: rows.sort((a, b) =>
      (b.task.date ?? "").localeCompare(a.task.date ?? ""),
    ),
  }));
  const label = (value: string) => cropAdviceLabel(value, locale);
  const date = (value: string | null) =>
    value
      ? new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, {
          timeZone: "UTC",
          dateStyle: "medium",
        })
      : t("Not recorded");

  if (!crops.length)
    return (
      <section className="crop-advice-empty">
        <strong>{t("No saved crops yet")}</strong>
        <p>
          {t(
            "Add a crop to your field to see its recommendations and details here.",
          )}
        </p>
        <Link className="btn" href="/crops">
          {t("Add crop / field →")}
        </Link>
      </section>
    );

  return (
    <>
      <section
        className="crop-advice-form"
        aria-label={t("Filter saved crops")}
      >
        <div className="crop-advice-fields crop-advice-inputs">
          <div className="crop-advice-field">
            <label htmlFor="advice-field">{t("Your field")}</label>
            <select
              id="advice-field"
              value={fieldId}
              onChange={(event) => {
                setFieldId(event.target.value);
                setCycleId("");
              }}
            >
              <option value="">{t("All fields")}</option>
              {fields.map((crop) => (
                <option key={crop.fieldId} value={crop.fieldId}>
                  {crop.farm} · {crop.field}
                </option>
              ))}
            </select>
          </div>
          <div className="crop-advice-field">
            <label htmlFor="advice-crop">{t("Your saved crop")}</label>
            <select
              id="advice-crop"
              value={cycleId}
              onChange={(event) => setCycleId(event.target.value)}
            >
              <option value="">{t("All saved crops")}</option>
              {available.map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {label(crop.name)} · {crop.field} · {label(crop.season)} ·{" "}
                  {date(crop.sowing)} · {label(crop.status)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="crop-advice-form-note">
          {t(
            "Location, soil, season and water availability come from your saved field and crop records.",
          )}
        </p>
      </section>
      <section className="crop-today" aria-labelledby="crop-today-heading">
        <header>
          <h2 id="crop-today-heading">{short("today")}</h2>
          <time dateTime={today}>{date(today)}</time>
        </header>
        {actions.length ? (
          <ol>
            {actions.map((action) => {
              const Icon = icons[action.topic];
              return (
                <li key={`${action.crop.id}:${action.topic}`}>
                  <Icon size={19} aria-hidden="true" />
                  <div>
                    <strong>{short(action.topic)}</strong>
                    <small>
                      {label(action.crop.name)} · {action.crop.farm} ·{" "}
                      {action.crop.field}
                    </small>
                    <p>{short(action.message)}</p>
                  </div>
                  {action.topic !== "fertilizer" && (
                    <Link
                      href={topicHref(action.crop, action.topic)!}
                      prefetch={false}
                      aria-label={`${short("open")} · ${short(action.topic)} · ${label(action.crop.name)} · ${action.crop.field}`}
                    >
                      {short("open")}{" "}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p>{short("none")}</p>
        )}
      </section>
      {taskGroups.some((group) => group.rows.length > 0) && (
        <section className="crop-task-groups" aria-label={short("tasks")}>
          {taskGroups
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <section
                className={`crop-task-group${group.key === "overdue" ? " crop-task-group-overdue" : ""}`}
                key={group.key}
              >
                <h2>{group.label}</h2>
                {group.key === "overdue" ? (
                  <div className="crop-overdue-grid">
                    {overdueCards.map(({ crop, topic, rows }) => {
                      const latest = rows[0].task;
                      const href =
                        topic === "harvest"
                          ? `/production?cycle=${encodeURIComponent(crop.id)}`
                          : (topicHref(crop, topic as Topic) ??
                            `/crop-calendar?cycle=${encodeURIComponent(crop.id)}`);
                      const Icon = icons[topic as Topic] ?? CalendarDays;
                      return (
                        <article
                          className="crop-overdue-card"
                          key={`${crop.id}:${topic}`}
                        >
                          <div className="crop-overdue-card-heading">
                            <span className="crop-overdue-icon">
                              <Icon size={17} aria-hidden="true" />
                            </span>
                            <strong>
                              {short(
                                topic as Parameters<typeof fieldAdviceText>[1],
                              )}
                            </strong>
                            <time
                              className="crop-overdue-date"
                              dateTime={latest.date ?? undefined}
                            >
                              {date(latest.date)}
                            </time>
                          </div>
                          <p>
                            {label(crop.name)} · {crop.farm} · {crop.field}
                          </p>
                          <div className="crop-overdue-card-actions">
                            <span>{short("overdueConfirm")}</span>
                            <Link href={href} prefetch={false}>
                              {short("open")}{" "}
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </Link>
                          </div>
                          <div className="crop-overdue-card-footer">
                            <span>
                              {short("overdueCount").replace(
                                "{count}",
                                new Intl.NumberFormat(locale).format(
                                  rows.length,
                                ),
                              )}
                            </span>
                            {latest.sourceUrl && (
                              <a
                                href={latest.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={latest.source ?? short("source")}
                              >
                                {short("source")} ↗
                              </a>
                            )}
                          </div>
                          {rows.length > 1 && (
                            <details className="crop-overdue-history">
                              <summary>{short("olderTasks")}</summary>
                              <ul>
                                {rows.slice(1).map(({ task }, index) => (
                                  <li key={`${task.date}:${index}`}>
                                    <span>
                                      {date(task.date)} · {short("overdue")}
                                    </span>
                                    {task.sourceUrl ? (
                                      <a
                                        href={task.sourceUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {short("source")} ↗
                                      </a>
                                    ) : (
                                      task.source && (
                                        <small>{task.source}</small>
                                      )
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <ul>
                    {group.rows.map(({ crop, task }, index) => (
                      <li
                        key={`${crop.id}:${task.topic}:${task.date}:${task.completedDate}:${index}`}
                      >
                        <span>
                          <strong>
                            {short(
                              task.topic as Parameters<
                                typeof fieldAdviceText
                              >[1],
                            )}
                          </strong>
                          <small>
                            {label(crop.name)} · {crop.farm} · {crop.field}
                          </small>
                        </span>
                        <span>
                          {task.done
                            ? date(task.completedDate ?? task.date)
                            : date(task.date)}
                        </span>
                        <span>
                          {task.done
                            ? short("completed")
                            : task.date && task.date < today
                              ? short("overdueConfirm")
                              : task.date === today
                                ? short("dueToday")
                                : short("upcoming")}
                        </span>
                        <Link
                          href={
                            task.topic === "harvest"
                              ? `/production?cycle=${encodeURIComponent(crop.id)}`
                              : (topicHref(crop, task.topic as Topic) ??
                                `/crop-calendar?cycle=${encodeURIComponent(crop.id)}`)
                          }
                          prefetch={false}
                        >
                          {short("open")}{" "}
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </Link>
                        <small>
                          {task.source?.startsWith("CROP_CALENDAR_ACTIVITY:")
                            ? short("calendar")
                            : task.source || short("savedRecord")}
                          {task.updated && (
                            <>
                              {" "}
                              · {short("updated")}: {date(task.updated)}
                            </>
                          )}
                          {task.sourceUrl && (
                            <a
                              href={task.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {" "}
                              · {short("source")}
                            </a>
                          )}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
        </section>
      )}
      <section className="crop-advice-results">
        <div className="crop-advice-results-heading">
          <h2>{t("Your crop recommendations")}</h2>
          <span className="crop-advice-assistant">
            {t("{count} saved crops · Stored crop profiles", {
              count: shown.length,
            })}
          </span>
        </div>
        <div className="crop-advice-crop-grid">
          {shown.map((crop) => {
            const guidance = crop.soilGuidance.filter(
              (item) => normalize(item.soil) === normalize(crop.soil),
            );
            const knownSoils = [
              ...crop.soils,
              ...crop.soilGuidance.map((item) => item.soil),
            ];
            const soilMatch = knownSoils.some(
              (soil) => normalize(soil) === normalize(crop.soil),
            );
            const seasonMatch = crop.seasons.some(
              (season) => normalize(season) === normalize(crop.season),
            );
            const ranks: Record<string, number> = {
              LOW: 1,
              MEDIUM: 2,
              HIGH: 3,
            };
            const waterShort =
              ranks[crop.availableWater] < ranks[crop.waterNeed];
            return (
              <article className="crop-advice-crop" key={crop.id}>
                <Image
                  className="crop-card-image"
                  src={`/crop-advice/${crop.advice.image}.webp`}
                  width={720}
                  height={400}
                  sizes="(max-width: 900px) 100vw, 40vw"
                  alt=""
                />
                <div className="crop-card-body">
                  <div className="crop-advice-crop-title">
                    <h3>
                      {label(crop.name)}
                      {crop.variety && ` · ${crop.variety}`}
                    </h3>
                    <span className="crop-advice-assistant">
                      {label(crop.status)}
                    </span>
                  </div>
                  <p>
                    {crop.farm} · {crop.field} · {label(crop.district)},{" "}
                    {label(crop.state)}
                  </p>
                  {crop.actualHarvest && (
                    <p>
                      {waterText.completed} ·{" "}
                      <time dateTime={crop.actualHarvest}>
                        {date(crop.actualHarvest)}
                      </time>
                    </p>
                  )}
                  <section
                    className="crop-stage-summary"
                    aria-label={short("calendar")}
                  >
                    <div>
                      <span>{t("Growth stage")}</span>
                      <strong>
                        {crop.stage ? label(crop.stage) : short("stageUnknown")}
                      </strong>
                    </div>
                    {crop.ageDays !== null && (
                      <small>
                        {short("daysAfterSowing").replace(
                          "{days}",
                          new Intl.NumberFormat(locale).format(crop.ageDays),
                        )}
                      </small>
                    )}
                    <small>
                      {crop.stageBasis === "FARMER_CONFIRMED"
                        ? short("farmerConfirmed")
                        : crop.stageBasis === "CALENDAR_ESTIMATE"
                          ? short("calendarEstimate")
                          : crop.stageBasis === "COMPLETED"
                            ? short("completed")
                            : short("stageUnknown")}
                      {crop.stageConfirmedAt && (
                        <> · {date(crop.stageConfirmedAt)}</>
                      )}
                    </small>
                    {crop.stageReference && (
                      <small>
                        {crop.stageScope} ·{" "}
                        {crop.stageReferenceUrl && (
                          <a
                            href={crop.stageReferenceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {short("source")} ↗
                          </a>
                        )}{" "}
                        · {date(references.reviewedOn)}
                      </small>
                    )}
                    {crop.overdueHarvest && (
                      <strong className="crop-harvest-overdue">
                        {short("harvestNeedsConfirmation")} ·{" "}
                        {date(crop.harvest)}
                      </strong>
                    )}
                    <Link
                      className="subtle-link"
                      href={`/crops#cycle-${encodeURIComponent(crop.id)}`}
                    >
                      {t("View / update crop →")}
                    </Link>
                  </section>
                  <section
                    className="crop-regional-status"
                    aria-label={t("Season recommendation")}
                  >
                    <strong>{t("Regional soil context")}</strong>
                    {crop.locationSuitability ? (
                      <>
                        <p>
                          {crop.locationSuitability.notes ||
                            `${short("regionalMatch")}: ${label(crop.locationSuitability.district || crop.locationSuitability.state)}, ${label(crop.locationSuitability.season)}.`}
                        </p>
                        {crop.locationSuitability.source && (
                          <small>
                            {crop.locationSuitability.source} ·{" "}
                            {date(references.reviewedOn)}{" "}
                            {crop.locationSuitability.url && (
                              <a
                                href={crop.locationSuitability.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {short("source")} ↗
                              </a>
                            )}
                          </small>
                        )}
                      </>
                    ) : (
                      <p>
                        {short("regionalMissing")}{" "}
                        {crop.illustrative &&
                          t(
                            "Demo crop profile: local suitability has not been verified.",
                          )}
                      </p>
                    )}
                  </section>
                  <Link
                    className="subtle-link"
                    href={`/assistant?cycle=${encodeURIComponent(crop.id)}`}
                  >
                    {waterText.assistant}{" "}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                  <div className="crop-card-soil">
                    <Sprout size={18} aria-hidden="true" />
                    <div>
                      <strong>{short("soil")}</strong>
                      <p>
                        {short(
                          soilMatch && !crop.illustrative
                            ? "soilListed"
                            : "soilCheck",
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="crop-card-topics">
                    {crop.advice.tasks.map((task) => {
                      const Icon = icons[task.topic];
                      const needsLocation = task.message === "locationMissing";
                      return (
                        <details key={task.topic}>
                          <summary>
                            <Icon size={17} aria-hidden="true" />{" "}
                            {short(task.topic)}
                          </summary>
                          <p>{short(task.message)}</p>
                          {"date" in task && task.date && (
                            <p>
                              <time dateTime={task.date}>
                                {date(task.date)}
                              </time>
                              {task.topic === "harvest" && crop.harvestEstimated
                                ? t(" (estimated)")
                                : ""}
                            </p>
                          )}
                          {task.topic === "irrigation" && crop.growing && (
                            <div lang={locale === "hi" ? "hi" : "en"}>
                              <strong>{waterText.demand}</strong>
                              {crop.demand ? (
                                <>
                                  <p>
                                    {[
                                      ...new Set([
                                        crop.demand.min,
                                        crop.demand.max,
                                      ]),
                                    ]
                                      .map((value) =>
                                        new Intl.NumberFormat(locale, {
                                          maximumFractionDigits: 2,
                                        }).format(value),
                                      )
                                      .join("–")}{" "}
                                    {locale === "hi" ? "मिमी/दिन" : "mm/day"}
                                  </p>
                                  <p>
                                    <a href={crop.demand.source.cropUrl}>FAO</a>{" "}
                                    ·{" "}
                                    <a
                                      href={crop.demand.source.climateSourceUrl}
                                    >
                                      {crop.demand.mode === "live"
                                        ? waterText.forecast
                                        : waterText.normal}
                                    </a>{" "}
                                    ·{" "}
                                    {crop.demand.providerTime ??
                                      crop.demand.source.climateVersion}
                                  </p>
                                  <p>{waterText.assumptions}</p>
                                </>
                              ) : (
                                <p>{waterText.missing}</p>
                              )}
                              <p>{waterText.measure}</p>
                            </div>
                          )}
                          {task.topic === "irrigation" &&
                            crop.stageSource &&
                            crop.growing && (
                              <p>
                                {short("maizeMoisture")}{" "}
                                <a
                                  className="subtle-link"
                                  href={crop.stageSource}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  TNAU{" "}
                                  <ArrowUpRight size={15} aria-hidden="true" />
                                </a>
                              </p>
                            )}
                          {task.topic === "irrigation" && crop.lastWatering && (
                            <p>
                              {waterText.lastWatering} ·{" "}
                              <time dateTime={crop.lastWatering}>
                                {date(crop.lastWatering)}
                              </time>
                            </p>
                          )}
                          {task.topic === "fertilizer" &&
                            crop.lastFertilizer && (
                              <p>
                                {waterText.lastFertilizer} ·{" "}
                                <time dateTime={crop.lastFertilizer}>
                                  {date(crop.lastFertilizer)}
                                </time>
                              </p>
                            )}
                          {task.topic === "fertilizer" && (
                            <section className="crop-lab-status">
                              <strong>{short("soilHealthCard")}</strong>
                              {crop.soilSample ? (
                                <small>
                                  {short("sampleDate")}: {date(crop.soilSample)}
                                </small>
                              ) : (
                                <p>{short("noSoilReport")}</p>
                              )}
                              {crop.npkStatus.length > 0 && (
                                <ul>
                                  {crop.npkStatus.map((row) => (
                                    <li key={row.name}>
                                      {label(row.name)}:{" "}
                                      {row.value === null
                                        ? short("notRecorded")
                                        : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(row.value)} ${row.unit}`}{" "}
                                      · {label(row.rating)}
                                      {row.basis && row.basis !== "UNKNOWN"
                                        ? ` · ${row.basis}`
                                        : ""}
                                      {row.reason && (
                                        <small style={{ display: "block" }}>
                                          {soilText(locale, row.reason)}
                                        </small>
                                      )}
                                      {row.band && (
                                        <small style={{ display: "block" }}>
                                          {row.band}
                                        </small>
                                      )}
                                      {row.sourceUrl && (
                                        <a
                                          href={row.sourceUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          {" "}
                                          · {row.sourceName ?? short("source")}
                                        </a>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {crop.microReadings.length > 0 && (
                                <>
                                  <strong>{short("otherSoilReadings")}</strong>
                                  <ul>
                                    {crop.microReadings.map(
                                      (reading, index) => (
                                        <li key={`${reading.name}:${index}`}>
                                          {label(reading.name)}:{" "}
                                          {new Intl.NumberFormat(locale, {
                                            maximumFractionDigits: 3,
                                          }).format(reading.value)}{" "}
                                          {reading.unit} ·{" "}
                                          {reading.interpretation}
                                          {reading.date && (
                                            <> · {date(reading.date)}</>
                                          )}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </>
                              )}
                              <p>{short("historicalLab")}</p>
                              <Link
                                className="subtle-link"
                                href={topicHref(crop, "fertilizer")!}
                              >
                                {short("openFertilizer")}
                              </Link>
                            </section>
                          )}
                          {task.topic === "fertilizer" &&
                            crop.hasLowNutrients && (
                              <p>{short("lowNutrients")}</p>
                            )}
                          {task.topic === "protection" &&
                            task.message === "scout" && (
                              <p>{short("protectMissing")}</p>
                            )}
                          {task.topic === "harvest" &&
                            !crop.harvest &&
                            task.message !== "harvestRecords" && (
                              <p>{short("missingHarvest")}</p>
                            )}
                          {task.topic === "calendar" && crop.stage && (
                            <p>
                              {label(crop.stage)}
                              {crop.stageDate && (
                                <>
                                  {" "}
                                  ·{" "}
                                  <time dateTime={crop.stageDate}>
                                    {date(crop.stageDate)}
                                  </time>
                                </>
                              )}
                            </p>
                          )}
                          {task.topic === "protection" &&
                            crop.risks.length > 0 && (
                              <>
                                <p>{short("possibleRisk")}</p>
                                <ul>
                                  {crop.risks.map((risk) => (
                                    <li key={risk.name}>
                                      <a
                                        className="subtle-link"
                                        href={risk.source}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {risk.name}{" "}
                                        <ArrowUpRight
                                          size={15}
                                          aria-hidden="true"
                                        />
                                      </a>{" "}
                                      ·{" "}
                                      <time dateTime={risk.reviewed}>
                                        {date(risk.reviewed)}
                                      </time>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                          {task.topic === "protection" &&
                            crop.protectionDate && (
                              <p>
                                <time dateTime={crop.protectionDate}>
                                  {date(crop.protectionDate)}
                                </time>
                              </p>
                            )}
                          {task.topic === "harvest" &&
                            task.message !== "harvestRecords" &&
                            task.message !== "harvestGeneric" && (
                              <p>{short("harvestGeneric")}</p>
                            )}
                          {task.topic === "weather" && crop.rain !== null && (
                            <p>
                              {short("forecast")} ·{" "}
                              <time dateTime={today}>{date(today)}</time> ·{" "}
                              {new Intl.NumberFormat(locale).format(crop.rain)}{" "}
                              {t("mm")}
                            </p>
                          )}
                          {task.topic === "weather" && crop.weatherInfo && (
                            <section className="crop-weather-snapshot">
                              <strong>{short("currentConditions")}</strong>
                              <p>
                                {new Intl.NumberFormat(locale, {
                                  maximumFractionDigits: 1,
                                }).format(crop.weatherInfo.currentTemp)}{" "}
                                °C ·{" "}
                                {new Intl.NumberFormat(locale).format(
                                  crop.weatherInfo.currentHumidity,
                                )}
                                % {short("humidity")} ·{" "}
                                {new Intl.NumberFormat(locale, {
                                  maximumFractionDigits: 1,
                                }).format(crop.weatherInfo.currentRain)}{" "}
                                {t("mm")} {short("currentPrecipitation")}
                              </p>
                              <small>
                                {short("modelTime")}:{" "}
                                {crop.weatherInfo.currentAt.replace("T", " ")} ·{" "}
                                {crop.weatherInfo.source}
                              </small>
                              <strong>{short("todayForecast")}</strong>
                              <p>
                                {crop.weatherInfo.forecastDate
                                  ? date(crop.weatherInfo.forecastDate)
                                  : short("notRecorded")}
                                : {crop.weatherInfo.forecastLow ?? "—"}–
                                {crop.weatherInfo.forecastHigh ?? "—"} °C ·{" "}
                                {crop.weatherInfo.forecastRain ?? "—"} {t("mm")}{" "}
                                {short("rain")} ·{" "}
                                {crop.weatherInfo.rainChance ?? "—"}%{" "}
                                {short("chance")}
                              </p>
                              <small>{short("forecastScope")}</small>
                              <p>
                                <a
                                  href="https://open-meteo.com/"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {short("source")}: Open-Meteo ↗
                                </a>
                              </p>
                            </section>
                          )}
                          {(needsLocation || task.topic !== "fertilizer") && (
                            <Link
                              className="subtle-link"
                              href={
                                needsLocation
                                  ? "/farms"
                                  : topicHref(crop, task.topic)!
                              }
                              prefetch={false}
                            >
                              {short("open")}{" "}
                              <ArrowUpRight size={15} aria-hidden="true" />
                            </Link>
                          )}
                        </details>
                      );
                    })}
                  </div>
                  <details className="crop-card-details">
                    <summary>{short("more")}</summary>
                    <p>
                      {short("soilSample")} · {date(crop.soilSample)}
                    </p>
                    <details>
                      <summary>{t("Original crop profile context")}</summary>
                      <p>
                        {t(
                          crop.description ||
                            "A detailed description has not been configured for this crop.",
                        )}
                      </p>
                      {crop.descriptionSource && (
                        <p>
                          {t(
                            "Profile source: {source}. This original profile may describe another region.",
                            { source: t(crop.descriptionSource) },
                          )}
                        </p>
                      )}
                    </details>
                    {crop.illustrative && (
                      <p>
                        {t(
                          "Demo crop profile: local suitability has not been verified.",
                        )}
                      </p>
                    )}
                    <dl>
                      <div>
                        <dt>{t("Field details")}</dt>
                        <dd>
                          {crop.area.replace(/acre|hectare/gi, (unit) =>
                            label(unit),
                          )}{" "}
                          · {label(crop.soil)} · {label(crop.season)}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          {t(
                            "Soil recommendation · Offline reference {version}",
                            { version: crop.soilAdvice.version },
                          )}
                        </dt>
                        <dd>
                          {crop.soilAdvice.summary}
                          <p>
                            {soilMatch
                              ? t(
                                  "Your field soil is listed in this crop’s stored profile.",
                                )
                              : knownSoils.length
                                ? t(
                                    "Stored profile soils: {soils}. Your field soil is not listed; this does not establish unsuitability.",
                                    {
                                      soils: [...new Set(knownSoils)]
                                        .map(label)
                                        .join(", "),
                                    },
                                  )
                                : t(
                                    "No exact soil-type match is stored. Alluvial describes soil origin; texture, pH and drainage must also be checked.",
                                  )}
                          </p>
                          {guidance.map((item, index) => (
                            <p key={index}>
                              {item.notes && t(item.notes)}
                              {item.minPh !== null &&
                                item.maxPh !== null &&
                                t(
                                  "Stored soil-profile pH range: {min}–{max}.",
                                  { min: item.minPh, max: item.maxPh },
                                )}
                              {item.url?.startsWith("https://") && (
                                <a
                                  className="subtle-link"
                                  href={item.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {" "}
                                  {t(item.source || "Soil profile source")}{" "}
                                  <ArrowUpRight size={15} aria-hidden="true" />
                                </a>
                              )}
                            </p>
                          ))}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Texture and structure")}</dt>
                        <dd>{crop.soilAdvice.texture}</dd>
                      </div>
                      <div>
                        <dt>{t("Drainage and root zone")}</dt>
                        <dd>{crop.soilAdvice.drainage}</dd>
                      </div>
                      <div>
                        <dt>{t("Soil pH")}</dt>
                        <dd>{crop.soilAdvice.phMessage}</dd>
                      </div>
                      <div>
                        <dt>{t("Regional soil context")}</dt>
                        <dd>{crop.soilAdvice.regional}</dd>
                      </div>
                      <div>
                        <dt>{t("Soil tests to request")}</dt>
                        <dd>{crop.soilAdvice.testing}</dd>
                      </div>
                      <div>
                        <dt>{t("Nutrients and organic matter")}</dt>
                        <dd>{crop.soilAdvice.nutrientPlan}</dd>
                      </div>
                      <div>
                        <dt>{t("Season recommendation")}</dt>
                        <dd>
                          {crop.seasons.length
                            ? seasonMatch
                              ? t("{season} matches the saved crop profile.", {
                                  season: label(crop.season),
                                })
                              : t(
                                  "{season} is not listed. Profile seasons: {seasons}. Check the local sowing window.",
                                  {
                                    season: label(crop.season),
                                    seasons: crop.seasons.map(label).join(", "),
                                  },
                                )
                            : t("Season suitability data is not configured.")}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Water guidance")}</dt>
                        <dd>
                          {t(
                            "Crop need: {need} · Field availability: {available}.",
                            {
                              need: label(crop.waterNeed),
                              available: label(crop.availableWater),
                            },
                          )}{" "}
                          {waterShort
                            ? t(
                                "Your recorded water availability is below the crop requirement; check irrigation access.",
                              )
                            : t(
                                "Check field moisture and rainfall in the irrigation planner before watering.",
                              )}
                        </dd>
                      </div>
                      {crop.water.map((water, index) => (
                        <div key={index}>
                          <dt>
                            {t(water.period)} · {t(water.measure)}
                          </dt>
                          <dd>
                            {water.valueMm} {t("mm")}
                            {water.method &&
                              t(" · Method: {method}", {
                                method: label(water.method),
                              })}
                            {water.scope &&
                              t(" · Study location: {scope}", {
                                scope: t(water.scope),
                              })}
                            {water.notes && ` · ${t(water.notes)}`}
                            {water.sourceUrl?.startsWith("https://") && (
                              <a
                                className="subtle-link"
                                href={water.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {t("Source ↗")}
                              </a>
                            )}
                          </dd>
                        </div>
                      ))}
                      {!crop.water.length && (
                        <div>
                          <dt>{t("Season water quantity")}</dt>
                          <dd>
                            {t(
                              "No water quantity in mm is configured for this crop and season.",
                            )}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>{t("Fertilizer guidance")}</dt>
                        <dd>
                          {guidance
                            .map((item) =>
                              item.fertilizer ? t(item.fertilizer) : "",
                            )
                            .filter(Boolean)
                            .join(" ") ||
                            t(
                              "Use a soil test and the local KVK crop advisory; no field-specific fertilizer dose is configured.",
                            )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Growth stage")}</dt>
                        <dd>
                          {crop.stage
                            ? label(crop.stage)
                            : t("Not recorded — update it in Crop / Field.")}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Crop dates")}</dt>
                        <dd>
                          {t("Sowing: {date}", { date: date(crop.sowing) })}
                          <br />
                          {t("Expected harvest: {date}", {
                            date: date(crop.harvest),
                          })}
                          {crop.harvest && crop.harvestEstimated
                            ? t(" (estimated)")
                            : ""}
                          {crop.duration
                            ? t(" · Duration: {days} days", {
                                days: crop.duration,
                              })
                            : ""}
                        </dd>
                      </div>
                    </dl>
                  </details>
                  <details className="crop-card-details">
                    <summary>{short("sources")}</summary>
                    <p>
                      {short("reviewed")} ·{" "}
                      <time dateTime={references.reviewedOn}>
                        {date(references.reviewedOn)}
                      </time>
                    </p>
                    <p>{short("limits")}</p>
                    <ul>
                      {Object.values(references.sources).map((source) => (
                        <li key={source.url}>
                          <a
                            className="subtle-link"
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source.title}{" "}
                            <ArrowUpRight size={15} aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                      {crop.advice.harvestSource && (
                        <li>
                          <a
                            className="subtle-link"
                            href={crop.advice.harvestSource}
                            target="_blank"
                            rel="noreferrer"
                          >
                            TNAU Agritech · {label(crop.name)}{" "}
                            <ArrowUpRight size={15} aria-hidden="true" />
                          </a>
                        </li>
                      )}
                    </ul>
                    <div className="soil-advice-sources">
                      <p>{crop.soilAdvice.scope}</p>
                      <strong>{t("Reference sources")}</strong>
                      <ul>
                        {crop.soilAdvice.sources.map((source) => (
                          <li key={source.url}>
                            <a
                              className="subtle-link"
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t(source.title)}{" "}
                              <ArrowUpRight size={15} aria-hidden="true" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                  <button
                    className="fertilizer-secondary crop-ai-button"
                    type="button"
                    disabled={loading[crop.id]}
                    onClick={() => explain(crop)}
                  >
                    {loading[crop.id]
                      ? t("Loading explanation…")
                      : t("Explain soil advice online")}
                  </button>
                  {online[crop.id]?.locale === locale && (
                    <div role="status">
                      <p>
                        {online[crop.id].mode === "online"
                          ? t(
                              "Online · AI explanation of the listed references",
                            )
                          : t("Offline · bundled references")}
                      </p>
                      <p>{online[crop.id].message}</p>
                      {online[crop.id].tips?.length ? (
                        <FarmerAdviceCard
                          locale={locale}
                          problem={crop.soilAdvice.phMessage}
                          reason={crop.soilAdvice.testing}
                          actions={online[crop.id].tips}
                          details={<p>{crop.soilAdvice.scope}</p>}
                        />
                      ) : null}
                    </div>
                  )}
                  <p>
                    <Link
                      className="subtle-link"
                      href={`/crops#cycle-${encodeURIComponent(crop.id)}`}
                    >
                      {t("View / update crop →")}
                    </Link>
                  </p>
                  <Link
                    className="subtle-link"
                    href={topicHref(crop, "irrigation")!}
                  >
                    {t("Open irrigation planner →")}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
        <p className="crop-advice-footnote">
          {t(
            "Advice compares your saved field records with stored crop profiles. It does not verify district suitability. Water figures describe their stated period and measure; use the irrigation planner for a field watering decision.",
          )}
        </p>
      </section>
    </>
  );
}
