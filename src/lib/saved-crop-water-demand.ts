import {
  calculateSimpleIrrigation,
  type SimplePlannerInput,
} from "./simple-irrigation-planner";
import type { OpenMeteoForecast } from "./open-meteo";

export function savedCropWaterDemand(
  input: Omit<
    SimplePlannerInput,
    "weatherMode" | "liveEt0MmDay" | "liveWeatherDate"
  >,
  forecast: OpenMeteoForecast | null,
  today: string,
) {
  const forecastIndex =
    forecast && !forecast.demo ? forecast.daily.time.indexOf(today) : -1;
  const et0 =
    forecastIndex >= 0
      ? forecast?.daily.et0_fao_evapotranspiration?.[forecastIndex]
      : undefined;
  const live = typeof et0 === "number" && Number.isFinite(et0) && et0 >= 0;
  const result = calculateSimpleIrrigation({
    ...input,
    month: Number(today.slice(5, 7)),
    weatherMode: live ? "live" : "offline",
    liveEt0MmDay: live ? et0 : undefined,
    liveWeatherDate: live ? today : undefined,
  });
  if (
    result.etcMinMmPerDay === undefined ||
    result.etcMaxMmPerDay === undefined ||
    result.source.cropVerification.startsWith("GROUP_PROXY")
  )
    return null;
  return {
    min: result.etcMinMmPerDay,
    max: result.etcMaxMmPerDay,
    source: result.source,
    mode: result.weatherMode,
    providerTime: live ? forecast?.current.time : undefined,
  };
}
