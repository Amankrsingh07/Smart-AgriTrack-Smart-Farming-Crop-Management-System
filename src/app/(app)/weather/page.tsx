import FarmerAdviceCard from "../farmer-advice-card";
import { farmerTerm } from "@/i18n/farmer-terms";
import { soilText } from "@/i18n/soil-health";
import Link from "next/link";
import {
  Droplet,
  Eye,
  FlaskConical,
  Sprout,
  Tractor,
  type LucideIcon,
} from "lucide-react";
import { getLocale } from "next-intl/server";
import { protectionText } from "@/i18n/crop-protection";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { addCropCycle } from "../../actions";
import LocationFields from "../location-fields";
import { recommendCrops } from "@/lib/recommend";
import { weatherAlerts } from "@/lib/weather-alerts";
import {
  geocodeIndianDistrict,
  loadOfflineForecast,
  loadOpenMeteoForecast,
  type OpenMeteoForecast as Forecast,
  type OpenMeteoPlace as Place,
} from "@/lib/open-meteo";

type Props = {
  searchParams: Promise<{
    search?: string;
    state?: string;
    district?: string;
    place?: string;
    mode?: string;
    farmId?: string;
  }>;
};
const seasonForMonth = (month: number) =>
  month >= 6 && month <= 9
    ? "KHARIF"
    : month >= 3 && month <= 5
      ? "ZAID"
      : "RABI";
const seasonNames: Record<string, string> = {
  KHARIF: "Kharif",
  RABI: "Rabi",
  ZAID: "Zaid",
};

export default async function WeatherPage({ searchParams }: Props) {
  const user = await getUser();
  if (!user) return null;
  const params = await searchParams;
  const locale = await getLocale();
  const searchTerm = (params.search ?? "").trim().slice(0, 100);
  const state = (params.state ?? "").trim().slice(0, 80);
  const district = (params.district ?? "").trim().slice(0, 80);
  const mode = params.mode === "offline" ? "offline" : "online";
  const farmInclude = {
    fields: {
      select: {
        id: true,
        name: true,
        soilType: true,
        waterAvailability: true,
        cropCycles: {
          where: { status: "ACTIVE" as const },
          take: 1,
          include: { crop: { select: { name: true, waterNeed: true } } },
        },
      },
    },
  };
  const farmId =
    typeof params.farmId === "string" && params.farmId.length <= 191
      ? params.farmId
      : undefined;
  const [farms, savedFarm] = await Promise.all([
    db.farm.findMany({
      where: { userId: user.id },
      include: farmInclude,
      take: 30,
    }),
    farmId
      ? db.farm.findFirst({
          where: { id: farmId, userId: user.id },
          include: farmInclude,
        })
      : null,
  ]);
  let forecast: Forecast | null = null,
    error = "",
    label = "",
    approximate = false,
    forecastSource = "";
  const candidates: Place[] = [];
  const selectedId = params.place;
  const farm =
    savedFarm ??
    farms.find((f) => f.latitude !== null && f.longitude !== null) ??
    farms[0];
  if (searchTerm || district) {
    label = `${district || searchTerm}, ${state || "India"}`;
    approximate = true;
    if (mode === "offline") {
      forecast = loadOfflineForecast();
      forecastSource = "Demo · synthetic weather sample";
    } else {
      try {
        const place = await geocodeIndianDistrict(
          district || searchTerm,
          state,
        );
        if (!place)
          throw new Error(
            "No matching Indian district was found. Check the district and state spelling.",
          );
        label = [place.name, place.admin2, place.admin1]
          .filter(Boolean)
          .join(", ");
        forecast = await loadOpenMeteoForecast(place.latitude, place.longitude);
        forecastSource = "Live API · Open-Meteo";
      } catch (e) {
        error = `${e instanceof Error ? e.message : "Online weather is unavailable."} Showing offline demonstration values.`;
        forecast = loadOfflineForecast();
        forecastSource = "Demo · synthetic weather sample";
      }
    }
  } else if (farm) {
    let lat = farm.latitude === null ? null : Number(farm.latitude),
      lon = farm.longitude === null ? null : Number(farm.longitude);
    label = `${farm.district}, ${farm.state} · ${farm.name}`;
    if (mode === "online") {
      try {
        if (lat === null || lon === null) {
          const match = await geocodeIndianDistrict(farm.district, farm.state);
          if (!match)
            throw new Error(
              "Could not match the farm district. Add farm coordinates or search a location.",
            );
          lat = match.latitude;
          lon = match.longitude;
          label = [match.name, match.admin2, match.admin1]
            .filter(Boolean)
            .join(", ");
          approximate = true;
        }
        forecast = await loadOpenMeteoForecast(lat, lon);
        forecastSource = "Live API · Open-Meteo";
      } catch (e) {
        error = `${e instanceof Error ? e.message : "Online weather is unavailable."} Showing offline demonstration values.`;
        forecast = loadOfflineForecast(lat ?? undefined, lon ?? undefined);
        forecastSource = "Demo · synthetic weather sample";
      }
    } else {
      forecast = loadOfflineForecast(lat ?? undefined, lon ?? undefined);
      forecastSource = "Demo · synthetic weather sample";
    }
  }
  const now = new Date();
  const season = seasonForMonth(now.getMonth() + 1);
  const suggestionState = state || farm?.state || "";
  const suggestionDistrict = district || farm?.district || "";
  const normalizeLocation = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const recommendationFarm = farms.find(
    (f) =>
      normalizeLocation(f.state) === normalizeLocation(suggestionState) &&
      normalizeLocation(f.district) === normalizeLocation(suggestionDistrict),
  );
  const activeField =
    recommendationFarm?.fields.find((f) => f.cropCycles.length > 0) ??
    recommendationFarm?.fields[0];
  const cropSuggestions = suggestionState
    ? await recommendCrops({
        state: suggestionState,
        district: suggestionDistrict,
        season,
        soilType: activeField?.soilType ?? "Other",
        water: activeField?.waterAvailability ?? "MEDIUM",
      })
    : [];
  const rainValues = forecast?.daily.precipitation_sum;
  const rainTotal =
    rainValues && rainValues.every((value): value is number => value !== null)
      ? rainValues.reduce((total, value) => total + value, 0)
      : null;
  const offlineSample = forecastSource.startsWith("Demo");
  const waterAdvice =
    rainTotal === null
      ? "Select a location to see rainfall-informed irrigation planning."
      : offlineSample
        ? `Offline demo rainfall totals ${rainTotal.toFixed(1)} mm over seven days. These generated values are not actual weather and must not guide irrigation.`
        : rainTotal >= 30
          ? `Forecast rainfall totals about ${rainTotal.toFixed(1)} mm over seven days. Check field drainage and soil moisture before your next irrigation; ${activeField?.cropCycles[0] ? `${activeField.cropCycles[0].crop.name} is recorded as active` : "crop stage is not recorded"}.`
          : `Forecast rainfall totals about ${rainTotal.toFixed(1)} mm over seven days. Review soil moisture before irrigation${activeField ? `; the selected farm's recorded water availability is ${activeField.waterAvailability.toLowerCase()}` : ""}. No sensor reading is available.`;
  const fieldAdvice = offlineSample
    ? "Load a live forecast for weather-based field planning."
    : forecast &&
        forecast.daily.precipitation_sum.some((x) => x !== null && x >= 10)
      ? "Rain is forecast on at least one day; consider postponing soil-disturbing work until fields are trafficable."
      : forecast &&
          forecast.daily.wind_speed_10m_max.some((x) => x !== null && x >= 25)
        ? "Wind may affect spraying or light materials; check product labels and local conditions before field work."
        : "No strong rain or wind interruption threshold is indicated. Check field conditions before machinery or spray work.";
  const wording = (text: string) => {
    const localized = protectionText(locale, text);
    return (
      farmerTerm(locale, text) ??
      (localized === text ? soilText(locale, text) : localized)
    );
  };
  return (
    <div className="weather-plan">
      <header className="plan-heading">
        <div>
          <p className="muted" style={{ margin: "0 0 5px" }}>
            Online forecast with offline sample fallback
          </p>
          <h1 style={{ margin: 0 }}>{wording("Weather & planning")}</h1>
        </div>
      </header>
      <Link className="subtle-link" href="/crop-loss">
        {protectionText(locale, "Harvest loss and prevention")}
      </Link>
      <section className="panel location-panel">
        <div>
          <h2 style={{ margin: "0 0 5px" }}>{wording("Choose a location")}</h2>
          <p className="muted" style={{ margin: 0 }}>
            Search an Indian district, or use a saved farm. Farm coordinates
            give the most local forecast.
          </p>
        </div>
        <form action="/weather" method="get" className="location-form">
          <LocationFields
            idPrefix="weather-search"
            stateValue={state || (farm?.state ?? "")}
            districtValue={district || (farm?.district ?? "")}
            stateRequired
            districtRequired
          />
          <label className="field">
            <span>{wording("Weather data mode")}</span>
            <select name="mode" defaultValue={mode}>
              <option value="online">{wording("Online live forecast")}</option>
              <option value="offline">{wording("Demo weather dataset")}</option>
            </select>
          </label>
          <button className="btn">{wording("Load weather")}</button>
        </form>
        {candidates.length > 0 && !selectedId && (
          <form action="/weather" method="get" className="choose-place">
            <input type="hidden" name="state" value={state} />
            <input
              type="hidden"
              name="district"
              value={district || searchTerm}
            />
            <label htmlFor="place">
              {wording("Confirm matching location")}
            </label>
            <select id="place" name="place" required defaultValue="">
              <option value="" disabled>
                {wording("Select a district result")}
              </option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {[p.name, p.admin2, p.admin1].filter(Boolean).join(", ")}
                </option>
              ))}
            </select>
            <button className="btn">{wording("Load forecast")}</button>
          </form>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </section>
      {forecast ? (
        <>
          <section className="panel current-weather">
            <div className="weather-title">
              <div>
                <span className="live-pill">{forecastSource}</span>
                <h2>{label || "Selected location"}</h2>
                <p className="muted">
                  {approximate
                    ? "District-level or approximate location"
                    : "Saved farm coordinates"}
                </p>
              </div>
              <div className="temperature">
                {Number.isFinite(forecast.current.temperature_2m)
                  ? Math.round(forecast.current.temperature_2m)
                  : "—"}
                <small>°C</small>
                <span>{!offlineSample ? "Forecast" : "Sample"}</span>
              </div>
            </div>
            <div className="weather-stats">
              <WeatherStat
                label="Humidity"
                value={`${displayValue(forecast.current.relative_humidity_2m)}%`}
              />
              <WeatherStat
                label="Wind"
                value={`${displayValue(forecast.current.wind_speed_10m)} km/h`}
              />
              <WeatherStat
                label="Rain now"
                value={`${displayValue(forecast.current.precipitation)} mm`}
              />
              <WeatherStat
                label="Next 7 days"
                value={
                  rainTotal === null
                    ? "Rain total unavailable"
                    : `${rainTotal.toFixed(1)} mm rain`
                }
              />
            </div>
          </section>
          <section>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Outlook</p>
                <h2>{wording("7-day forecast")}</h2>
              </div>
              <span className="muted">
                Rain chance and totals are model estimates
              </span>
            </div>
            <div className="forecast-grid">
              {forecast.daily.time.map((d, i) => (
                <article className="panel day-card" key={d}>
                  <strong>
                    {new Date(`${d}T12:00:00`).toLocaleDateString(locale, {
                      weekday: "short",
                    })}
                  </strong>
                  <span className="muted">
                    {new Date(`${d}T12:00:00`).toLocaleDateString(locale, {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <div className="day-temp">
                    {displayValue(forecast.daily.temperature_2m_max[i])}°{" "}
                    <small>
                      / {displayValue(forecast.daily.temperature_2m_min[i])}°
                    </small>
                  </div>
                  <span className="rain-value">
                    <Droplet size={15} strokeWidth={1.8} aria-hidden="true" />{" "}
                    {displayValue(
                      forecast.daily.precipitation_probability_max[i],
                    )}
                    % · {displayValue(forecast.daily.precipitation_sum[i])} mm
                  </span>
                  <small className="muted">
                    Wind up to{" "}
                    {displayValue(forecast.daily.wind_speed_10m_max[i])} km/h
                  </small>
                </article>
              ))}
            </div>
          </section>
          <section className="panel alert-panel">
            <h2 style={{ marginTop: 0 }}>{wording("Weather watch")}</h2>
            {offlineSample ? (
              <p className="muted">
                {wording(
                  "Offline values are demonstration samples only. Real weather alerts are unavailable without an online forecast.",
                )}
              </p>
            ) : weatherAlerts(forecast).length ? (
              <ul>
                {weatherAlerts(forecast).map((x) => (
                  <li key={x}>{wording(x)}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                {wording(
                  "No frost, heavy rain, or heat thresholds are indicated in this forecast. Continue checking local field conditions.",
                )}
              </p>
            )}
          </section>
        </>
      ) : (
        !error && (
          <section className="panel empty-state">
            <h2>{wording("Weather forecast")}</h2>
            <p className="muted">
              Search a state and district to load current conditions and a
              seven-day forecast.
            </p>
          </section>
        )
      )}
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Outlook</p>
            <h2>
              {seasonNames[season]} crop suggestions ·{" "}
              {suggestionDistrict ? `${suggestionDistrict}, ` : ""}
              {suggestionState || "select a state"}
            </h2>
          </div>
        </div>
        <p className="muted">
          Configured profiles consider the selected location, season, and saved
          field soil/water profile. When a matching profile is unavailable,
          built-in seasonal examples are shown without assessing local
          suitability. Historical crop records show what was recorded in the
          source; they do not assess suitability. Confirm planting choices with
          local agricultural guidance.
        </p>
        {!suggestionState ? (
          <div className="panel muted">
            Choose a state above to see crop suggestions.
          </div>
        ) : cropSuggestions.length === 0 ? (
          <div className="panel muted">
            No crop examples are available for this season. Ask your local KVK /
            agriculture officer for guidance.
          </div>
        ) : (
          <div className="crop-guide-grid">
            {cropSuggestions.map((crop, index) => (
              <article className="panel crop-guide" key={crop.id}>
                <span className="crop-icon">
                  <Sprout size={25} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h3>{crop.name}</h3>
                <span className="manual-tag">
                  {crop.category}
                  {crop.source === "profile" ? ` · ${crop.score}/100` : ""}
                </span>
                <p className="muted">
                  {crop.source === "climate"
                    ? "Built-in crop catalog · verify locally"
                    : `Water need: ${crop.water} · ${crop.illustrative ? "Demonstration profile" : "Configured profile"}`}
                </p>
                {crop.description && (
                  <p className="muted">{crop.description}</p>
                )}
                <ul>
                  {crop.reasons.slice(0, 2).map((reason, i) => (
                    <li
                      key={i}
                      className="muted"
                      style={{ fontSize: 13, marginTop: 5 }}
                    >
                      {reason}
                    </li>
                  ))}
                </ul>
                {crop.source === "profile" &&
                  farms.some((f) => f.fields.length > 0) && (
                    <form action={addCropCycle} className="add-crop-form">
                      <label htmlFor={`weather-field-${index}`}>
                        Add to field
                      </label>
                      <select
                        id={`weather-field-${index}`}
                        name="fieldId"
                        required
                      >
                        {farms.flatMap((f) =>
                          f.fields.map((field) => (
                            <option key={field.id} value={field.id}>
                              {f.name} — {field.name}
                            </option>
                          )),
                        )}
                      </select>
                      <input type="hidden" name="cropId" value={crop.id} />
                      <input type="hidden" name="season" value={season} />
                      <button className="btn">Add to crop register</button>
                    </form>
                  )}
              </article>
            ))}
          </div>
        )}
        <p className="disclaimer">
          Configured location matches may be illustrative and are not guaranteed
          agricultural prescriptions. Consult your local Krishi Vigyan Kendra
          (KVK) or agriculture officer before planting.
        </p>
      </section>
      <section className="panel">
        <h2>{wording("Farm guidance")}</h2>
        <FarmerAdviceCard
          locale={locale}
          problem={wording(
            offlineSample
              ? "Offline values are demonstration samples only. Real weather alerts are unavailable without an online forecast."
              : forecast
                ? "Rain chance and totals are model estimates"
                : "Live forecast unavailable.",
          )}
          reason={wording(waterAdvice)}
          actions={[
            wording("Check soil conditions on site."),
            wording("Follow product labels and local guidance."),
          ]}
          warning={wording(
            "Treat forecast rainfall as uncertain and check soil conditions on site.",
          )}
          details={
            <div className="advisory-grid">
              <Advice icon={FlaskConical} title="Soil & nutrients">
                Use a current soil test for pH and nutrient decisions. Follow
                crop and soil-specific advice from your soil lab or KVK. This
                app has no laboratory results here.
              </Advice>
              <Advice icon={Eye} title="Crop health watch">
                Inspect leaves, stems, and undersides regularly and record what
                you observe. These cards do not diagnose pests or disease.
              </Advice>
              <Advice icon={Tractor} title="Field work">
                {fieldAdvice} Follow product labels and local guidance.
              </Advice>
            </div>
          }
        />
      </section>
      <p className="disclaimer">
        Weather and crop suggestions are advisory and are not guaranteed
        agricultural prescriptions. Consult your local Krishi Vigyan Kendra
        (KVK) or agriculture officer for location-specific decisions.
      </p>
    </div>
  );
}
function displayValue(value: number | null) {
  return value === null ? "—" : Number(value.toFixed(1)).toString();
}
function WeatherStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Advice({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="panel advice-card">
      <span className="advice-icon">
        <Icon size={25} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div>
        <h3>{title}</h3>
        <p className="muted">{children}</p>
      </div>
    </article>
  );
}
