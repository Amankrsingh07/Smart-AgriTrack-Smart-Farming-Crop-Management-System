import { addCalendarDays } from "./irrigation-dates";

export type IrrigationMode = "measured" | "estimated" | "demo";
export const MAX_BALANCE_DAYS = 14;
export type DailyBalanceWeather = {
  date: string;
  et0Mm: number;
  rainMm: number;
};
export type PaddyInputs = {
  pondMm?: number;
  targetMm?: number;
  bundMm?: number;
  lossMm?: number;
  rainMm?: number;
};

export function finiteBetween(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

export function balanceDates(start?: string, end?: string) {
  if (!start || !end || start >= end) return null;
  try {
    addCalendarDays(start, 0);
    addCalendarDays(end, 0);
  } catch {
    return null;
  }
  const dates: string[] = [];
  let date = start;
  while (date < end && dates.length < MAX_BALANCE_DAYS) {
    date = addCalendarDays(date, 1);
    dates.push(date);
  }
  return date === end ? dates : null;
}

/** FAO-56 daily root-zone accounting, initialized at an explicitly confirmed field capacity. */
export function estimateRootZone({
  dates,
  weather,
  kc,
  tawMm,
  netWatering,
}: {
  dates: string[];
  weather: DailyBalanceWeather[];
  kc: number;
  tawMm: number;
  netWatering: { date: string; depthMm: number }[];
}) {
  if (
    !dates.length ||
    !finiteBetween(tawMm, Number.EPSILON, 3000) ||
    !finiteBetween(kc, 0, 3) ||
    netWatering.some(({ depthMm }) => !finiteBetween(depthMm, 0, 10_000))
  )
    return null;
  let depletionMm = 0;
  let effectiveRainfallMm = 0;
  let grossRainfallMm = 0;
  for (const date of dates) {
    const matches = weather.filter((day) => day.date === date);
    if (matches.length !== 1) return null;
    const { et0Mm, rainMm } = matches[0];
    if (!finiteBetween(et0Mm, 0, 50) || !finiteBetween(rainMm, 0, 1000))
      return null;
    // Daily convention: crop use, then rain, then net watering. Rain fills only
    // available storage. The model assumes rainfall infiltrates until that limit.
    depletionMm += et0Mm * kc;
    const retainedRainMm = Math.min(depletionMm, rainMm);
    effectiveRainfallMm += retainedRainMm;
    grossRainfallMm += rainMm;
    const wateringMm = netWatering
      .filter((event) => event.date === date)
      .reduce((sum, event) => sum + event.depthMm, 0);
    depletionMm = Math.min(
      tawMm,
      Math.max(0, depletionMm - retainedRainMm - wateringMm),
    );
  }
  return {
    depletionMm,
    effectiveRainfallMm,
    grossRainfallMm,
    elapsedDays: dates.length,
  };
}

/** One day of standing-water storage for an already flooded, saturated paddy. */
export function projectPaddyDay(input: PaddyInputs, etcMm: number | undefined) {
  const { pondMm, targetMm, bundMm, lossMm, rainMm } = input;
  if (
    !finiteBetween(bundMm, Number.EPSILON, 1000) ||
    !finiteBetween(pondMm, Number.EPSILON, bundMm) ||
    !finiteBetween(targetMm, Number.EPSILON, bundMm) ||
    !finiteBetween(lossMm, 0, 1000) ||
    !finiteBetween(rainMm, 0, 1000) ||
    !finiteBetween(etcMm, 0, 150)
  )
    return null;
  // Rain arrives before daily losses in this scenario. Report bund overflow
  // and flag when the surface storage is exhausted.
  const retainedRainMm = Math.min(rainMm, bundMm - pondMm);
  const endMm = pondMm + retainedRainMm - etcMm - lossMm;
  return {
    effectiveRainfallMm: retainedRainMm,
    overflowMm: rainMm - retainedRainMm,
    projectedPondMm: Math.max(0, endMm),
    netRequirementMm: Math.max(0, targetMm - endMm),
    pondExhausted: endMm <= 0,
  };
}
