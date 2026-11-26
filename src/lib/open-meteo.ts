import {
  WeatherForecastError,
  forecastNetworkFailure,
} from "./weather-diagnostics";
import { indianStateNamesMatch } from "./india-location";

export type OpenMeteoForecast = {
  demo?: true;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  daily: {
    time: string[];
    temperature_2m_min: Array<number | null>;
    temperature_2m_max: Array<number | null>;
    precipitation_probability_max: Array<number | null>;
    precipitation_sum: Array<number | null>;
    et0_fao_evapotranspiration?: Array<number | null>;
    wind_speed_10m_max: Array<number | null>;
    weather_code: Array<number | null>;
  };
  timezone?: string;
  timezone_abbreviation?: string;
  utc_offset_seconds?: number;
};

export type OpenMeteoPlace = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  admin2?: string;
  country?: string;
  country_code?: string;
};

/** Deterministic demonstration forecast generated locally; it is not observed or live weather. */
export function loadOfflineForecast(
  latitude = 30.3165,
  longitude = 78.0322,
): OpenMeteoForecast {
  const now = new Date();
  const seed = Math.abs(Math.round(latitude * 17 + longitude * 31));
  const dates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    return date.toISOString().slice(0, 10);
  });
  const temps = dates.map((_, i) => 24 + ((seed + i * 3) % 9));
  const rain = dates.map((_, i) =>
    (seed + i * 7) % 5 === 0 ? 8 : (seed + i * 2) % 3,
  );
  return {
    demo: true,
    current: {
      time: `${dates[0]}T09:00`,
      temperature_2m: temps[0],
      relative_humidity_2m: 58,
      precipitation: 0,
      wind_speed_10m: 8,
      weather_code: 1,
    },
    daily: {
      time: dates,
      temperature_2m_min: temps.map((t) => t - 8),
      temperature_2m_max: temps,
      precipitation_probability_max: rain.map((v) => (v ? 55 : 10)),
      precipitation_sum: rain,
      et0_fao_evapotranspiration: dates.map(
        (_, i) => 3.2 + ((seed + i) % 9) / 10,
      ),
      wind_speed_10m_max: dates.map((_, i) => 10 + ((seed + i) % 12)),
      weather_code: rain.map((v) => (v ? 61 : 1)),
    },
    timezone: "Asia/Kolkata",
    timezone_abbreviation: "IST",
    utc_offset_seconds: 19800,
  };
}

export async function loadOpenMeteoForecast(
  latitude: number,
  longitude: number,
  options: { pastDays?: number } = {},
): Promise<OpenMeteoForecast> {
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  )
    throw new WeatherForecastError(
      "INVALID_COORDINATES",
      "Invalid weather coordinates.",
    );
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
    daily:
      "temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,et0_fao_evapotranspiration,wind_speed_10m_max,weather_code",
    forecast_days: "7",
    timezone: "auto",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    temperature_unit: "celsius",
  });
  if (options.pastDays !== undefined)
    params.set("past_days", String(options.pastDays));
  let response: Response;
  try {
    response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw forecastNetworkFailure(error);
  }
  if (!response.ok)
    throw new WeatherForecastError(
      response.status === 429 ? "RATE_LIMITED" : "PROVIDER_HTTP",
      `Open-Meteo forecast is unavailable (HTTP ${response.status}).`,
      response.status,
    );
  let payload: Partial<OpenMeteoForecast> & {
    error?: boolean;
    reason?: string;
  };
  try {
    payload = await response.json();
  } catch {
    throw new WeatherForecastError(
      "INVALID_RESPONSE",
      "Open-Meteo returned a response that was not valid JSON.",
    );
  }
  if (payload.error)
    throw new Error(payload.reason || "Weather service returned an error.");
  const data = payload as OpenMeteoForecast;
  const current = data.current;
  if (
    !current ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(current.time) ||
    !Number.isFinite(Date.parse(`${current.time}Z`)) ||
    ![
      current.temperature_2m,
      current.relative_humidity_2m,
      current.precipitation,
      current.wind_speed_10m,
      current.weather_code,
    ].every(Number.isFinite) ||
    current.relative_humidity_2m < 0 ||
    current.relative_humidity_2m > 100 ||
    current.precipitation < 0 ||
    current.wind_speed_10m < 0 ||
    current.weather_code < 0
  ) {
    throw new WeatherForecastError(
      "INVALID_RESPONSE",
      "Open-Meteo returned invalid or incomplete current conditions.",
    );
  }
  const daily = data.daily;
  if (
    !Array.isArray(daily?.time) ||
    !daily.time.length ||
    !Array.isArray(daily.precipitation_sum) ||
    daily.precipitation_sum.length !== daily.time.length ||
    !Array.isArray(daily.precipitation_probability_max) ||
    daily.precipitation_probability_max.length !== daily.time.length ||
    !Array.isArray(daily.temperature_2m_max) ||
    daily.temperature_2m_max.length !== daily.time.length ||
    !Array.isArray(daily.temperature_2m_min) ||
    daily.temperature_2m_min.length !== daily.time.length ||
    (daily.et0_fao_evapotranspiration &&
      daily.et0_fao_evapotranspiration.length !== daily.time.length)
  ) {
    throw new Error("Open-Meteo returned an invalid daily forecast.");
  }
  for (const date of daily.time)
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    )
      throw new Error("Open-Meteo returned an invalid date.");
  const validOrNull = (value: number | null, minimum?: number) =>
    value === null ||
    (Number.isFinite(value) && (minimum === undefined || value >= minimum));
  for (const amount of daily.precipitation_sum)
    if (!validOrNull(amount, 0))
      throw new Error("Open-Meteo returned invalid rainfall values.");
  for (const chance of daily.precipitation_probability_max)
    if (!validOrNull(chance, 0) || (chance !== null && chance > 100))
      throw new Error(
        "Open-Meteo returned invalid precipitation probabilities.",
      );
  for (const temperature of [
    ...daily.temperature_2m_min,
    ...daily.temperature_2m_max,
  ])
    if (!validOrNull(temperature))
      throw new Error("Open-Meteo returned invalid temperature values.");
  for (const series of [daily.wind_speed_10m_max, daily.weather_code]) {
    if (
      !Array.isArray(series) ||
      series.length !== daily.time.length ||
      series.some((value) => !validOrNull(value))
    )
      throw new Error("Open-Meteo returned an invalid daily variable.");
  }
  if (
    daily.et0_fao_evapotranspiration &&
    daily.et0_fao_evapotranspiration.some((value) => !validOrNull(value, 0))
  )
    throw new Error("Open-Meteo returned invalid ET0 values.");
  return data;
}

/** Used only by the general planning page, where district estimates are labeled approximate. */
export async function geocodeIndianDistrict(
  district: string,
  state: string,
): Promise<OpenMeteoPlace | undefined> {
  if (!district || !state) return undefined;
  const params = new URLSearchParams({
    name: `${district}, ${state}`,
    count: "10",
    language: "en",
    countryCode: "IN",
    format: "json",
  });
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?${params}`,
    {
      cache: "force-cache",
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok)
    throw new Error(`Location service returned HTTP ${response.status}.`);
  const payload = (await response.json()) as { results?: OpenMeteoPlace[] };
  const results = (payload.results ?? []).filter(
    (place) => place.country_code === "IN" || place.country === "India",
  );
  return results.find(
    (place) => place.admin1 && indianStateNamesMatch(place.admin1, state),
  );
}
