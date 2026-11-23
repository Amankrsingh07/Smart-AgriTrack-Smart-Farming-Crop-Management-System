import type { OpenMeteoForecast } from "./open-meteo";

// This bulletin illustrates weather-dependent timing. Its local instructions
// are not applied to other farms or used to modify any application plan.
export const fertilizerRainReviewSource = "https://icar.gov.in/sites/default/files/2022-07/CWR-22-10-2021.pdf";

export function fertilizerForecastForDate(forecast: OpenMeteoForecast, date: string, today: string) {
  if (forecast.demo) return null;
  const index = forecast.daily.time.indexOf(date);
  if (date < today || index < 0) return null;
  const value = (series: Array<number | null>) => {
    const reading = series[index];
    return typeof reading === "number" && Number.isFinite(reading) ? reading : null;
  };
  return {
    rain: value(forecast.daily.precipitation_sum),
    probability: value(forecast.daily.precipitation_probability_max),
    temperature: value(forecast.daily.temperature_2m_max),
    wind: value(forecast.daily.wind_speed_10m_max),
  };
}

export function fertilizerRainReview(forecast: OpenMeteoForecast, date: string, today: string) {
  const review = fertilizerForecastForDate(forecast, date, today);
  if (!review || review.rain === null || review.rain <= 0) return null;
  return { rain: review.rain, probability: review.probability };
}
