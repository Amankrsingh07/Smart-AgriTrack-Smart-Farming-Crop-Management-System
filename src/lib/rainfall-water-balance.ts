export type RainfallEvent = {
  date: string;
  grossMm: number;
  effectiveMm: number | null;
  source: string;
  moistureMeasuredDate?: string;
  recordedAt?: string;
};
export type IrrigationEvent = { date: string; depthMm: number };

export type RainfallCreditStatus =
  | "ELIGIBLE"
  | "FORECAST_ONLY_NOT_CREDITED"
  | "OBSERVATION_FUTURE_DATED"
  | "ALREADY_REFLECTED_OR_AMBIGUOUS_DATE"
  | "MOISTURE_DATE_MISMATCH";

export function rainfallCreditEligibility(input: {
  source: string;
  rainfallDate: string;
  moistureMeasuredDate: string;
  today: string;
  recordedMoistureMeasuredDate?: string;
}): RainfallCreditStatus {
  if (!isObservedSource(input.source)) return "FORECAST_ONLY_NOT_CREDITED";
  if (input.rainfallDate > input.today) return "OBSERVATION_FUTURE_DATED";
  if (input.rainfallDate <= input.moistureMeasuredDate)
    return "ALREADY_REFLECTED_OR_AMBIGUOUS_DATE";
  if (
    input.recordedMoistureMeasuredDate !== undefined &&
    input.recordedMoistureMeasuredDate !== input.moistureMeasuredDate
  )
    return "MOISTURE_DATE_MISMATCH";
  return "ELIGIBLE";
}

export type RainfallTransactionIdentity = {
  transactionId: string;
  userId: string;
  cropCycleId: string;
  rainfallDate: string;
  moistureMeasuredDate: string;
  grossRainfallMm: number;
  source: string;
  runoffLossMm?: number | null;
  fieldCapacityPercent?: number | null;
  currentPercent?: number | null;
  rootZoneDepthM?: number | null;
  notes?: string | null;
};

export function rainfallTransactionFingerprint(
  record: RainfallTransactionIdentity,
) {
  return JSON.stringify({
    transactionId: record.transactionId,
    userId: record.userId,
    cropCycleId: record.cropCycleId,
    rainfallDate: record.rainfallDate,
    moistureMeasuredDate: record.moistureMeasuredDate,
    grossRainfallMm: record.grossRainfallMm,
    source: record.source,
    runoffLossMm: record.runoffLossMm ?? null,
    fieldCapacityPercent: record.fieldCapacityPercent ?? null,
    currentPercent: record.currentPercent ?? null,
    rootZoneDepthM: record.rootZoneDepthM ?? null,
    notes: record.notes?.trim() || null,
  });
}

export function calculateEffectiveRainfall(input: {
  grossRainfallMm: number;
  runoffLossMm?: number;
  fieldCapacityPercent?: number;
  currentMoisturePercent?: number;
  rootZoneDepthM?: number;
}) {
  const values = [
    input.grossRainfallMm,
    input.runoffLossMm,
    input.fieldCapacityPercent,
    input.currentMoisturePercent,
    input.rootZoneDepthM,
  ];
  if (
    values.some(
      (value) => typeof value !== "number" || !Number.isFinite(value),
    ) ||
    input.runoffLossMm! > input.grossRainfallMm ||
    input.fieldCapacityPercent! < input.currentMoisturePercent! ||
    input.rootZoneDepthM! <= 0
  ) {
    return {
      effectiveRainfallMm: null,
      drainageLossMm: null,
      status: "INSUFFICIENT_MEASUREMENTS",
    };
  }
  const netInfiltration = Math.max(
    0,
    input.grossRainfallMm - input.runoffLossMm!,
  );
  const rootZoneStorageToFieldCapacity =
    (input.fieldCapacityPercent! - input.currentMoisturePercent!) *
    10 *
    input.rootZoneDepthM!;
  const effectiveRainfallMm = Math.min(
    netInfiltration,
    rootZoneStorageToFieldCapacity,
  );
  return {
    effectiveRainfallMm,
    drainageLossMm: Math.max(0, netInfiltration - effectiveRainfallMm),
    status: "ESTIMATED_MEASURED_RUNOFF_AND_ROOT_STORAGE",
  };
}

export function projectRootZoneDepletion(input: {
  measuredDepletionMm: number;
  tawMm: number;
  etcMmPerDay: number;
  moistureMeasuredDate: string;
  calculationDate: string;
  rainfallEvents?: RainfallEvent[];
  irrigationEvents?: IrrigationEvent[];
}) {
  const start = Date.parse(`${input.moistureMeasuredDate}T00:00:00.000Z`);
  const end = Date.parse(`${input.calculationDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    throw new RangeError(
      "Soil moisture measurement date must be a valid date no later than calculation date.",
    );
  const rain = (input.rainfallEvents ?? []).filter(
    (event) =>
      rainfallCreditEligibility({
        source: event.source,
        rainfallDate: event.date,
        moistureMeasuredDate: input.moistureMeasuredDate,
        today: input.calculationDate,
        recordedMoistureMeasuredDate: event.moistureMeasuredDate,
      }) === "ELIGIBLE" &&
      event.date <= input.calculationDate &&
      event.effectiveMm !== null,
  );
  const irrigation = (input.irrigationEvents ?? []).filter(
    (event) =>
      event.date > input.moistureMeasuredDate &&
      event.date <= input.calculationDate &&
      Number.isFinite(event.depthMm) &&
      event.depthMm > 0,
  );
  const grossRainfallMm = (input.rainfallEvents ?? [])
    .filter(
      (event) =>
        rainfallCreditEligibility({
          source: event.source,
          rainfallDate: event.date,
          moistureMeasuredDate: input.moistureMeasuredDate,
          today: input.calculationDate,
          recordedMoistureMeasuredDate: event.moistureMeasuredDate,
        }) === "ELIGIBLE" && event.date <= input.calculationDate,
    )
    .reduce((sum, event) => sum + event.grossMm, 0);
  const rainByDate = groupByDate(rain);
  const irrigationByDate = groupByDate(irrigation);
  let depletion = Math.min(input.tawMm, Math.max(0, input.measuredDepletionMm));
  let effectiveRainfallMm = 0;
  for (let day = start + 86_400_000; day <= end; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    depletion = Math.min(input.tawMm, depletion + input.etcMmPerDay);
    for (const event of irrigationByDate.get(date) ?? [])
      depletion = Math.max(0, depletion - event.depthMm);
    for (const event of rainByDate.get(date) ?? []) {
      const credited = Math.min(depletion, Math.max(0, event.effectiveMm ?? 0));
      effectiveRainfallMm += credited;
      depletion -= credited;
    }
  }
  return {
    depletionMm: depletion,
    grossRainfallMm,
    effectiveRainfallMm,
    elapsedDays: Math.round((end - start) / 86_400_000),
  };
}

function isObservedSource(source: string) {
  return source === "MANUAL_OBSERVATION" || source === "WEATHER_STATION";
}

function groupByDate<T extends { date: string }>(events: T[]) {
  const result = new Map<string, T[]>();
  for (const event of events)
    result.set(event.date, [...(result.get(event.date) ?? []), event]);
  return result;
}
