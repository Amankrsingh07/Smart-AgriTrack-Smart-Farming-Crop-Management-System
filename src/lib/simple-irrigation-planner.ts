import cropKc from "@/data/irrigation/crop_kc.json";
import cropWater from "@/data/irrigation/crop_water_parameters.json";
import efficiencyReference from "@/data/irrigation/irrigation_efficiency.json";
import soilReference from "@/data/irrigation/soil_reference.json";
import plannerConfig from "@/data/irrigation/simple-planner.json";
import { findOfflineEt0, offlineEt0DatasetMeta } from "@/lib/et0-reference";
import { matchIrrigationSoil } from "./irrigation-soils";
import {
  balanceDates,
  estimateRootZone,
  finiteBetween,
  projectPaddyDay,
  type DailyBalanceWeather,
  type IrrigationMode,
  type PaddyInputs,
} from "./irrigation-estimate";
import { indiaCalendarDate } from "@/lib/irrigation-dates";
import {
  projectRootZoneDepletion,
  rainfallCreditEligibility,
  type IrrigationEvent,
  type RainfallEvent,
} from "@/lib/rainfall-water-balance";

export type SimplePlannerInput = {
  mode?: IrrigationMode;
  baselineAtFieldCapacity?: boolean;
  dailyWeather?: DailyBalanceWeather[];
  paddy?: PaddyInputs;
  developmentProgressPercent?: number;
  crop: string;
  state: string;
  district: string;
  area: number;
  areaUnit: string;
  growthStage: string;
  soil: string;
  method: string;
  month?: number;
  moisture?: {
    fieldCapacityPercent?: number;
    wiltingPointPercent?: number;
    currentPercent?: number;
    rootZoneDepthM?: number;
  };
  moistureMeasuredDate?: string;
  calculationDate?: string;
  rainfallEvents?: Array<RainfallEvent & { recordedAt?: string }>;
  irrigationEvents?: IrrigationEvent[];
  forecastRainfallMm?: number;
  forecastRainfallDate?: string;
  weatherRetrievedAt?: string;
  weatherMode?: "offline" | "live";
  liveEt0MmDay?: number;
  liveWeatherDate?: string;
  weatherLocation?: string;
};

export function matchIrrigationStage(value?: string | null) {
  return (
    plannerConfig.stages.find(
      (stage) => normalize(stage) === normalize(value ?? ""),
    ) ?? ""
  );
}

export function matchIrrigationMethod(value?: string | null) {
  const key = normalize(value ?? "");
  if (key === "surface" || key === "flood") return "Surface/Flood Irrigation";
  return (
    plannerConfig.methods.find(
      (method) =>
        normalize(method) === key || normalize(method) === `${key} irrigation`,
    ) ?? ""
  );
}

export function irrigationEfficiency(method: string) {
  const saved = matchIrrigationMethod(method);
  const name = saved === "Furrow" ? "Surface/Flood Irrigation" : saved;
  return efficiencyReference.methods.find(
    (row) => normalize(row.method) === normalize(name),
  )?.efficiencyPercent;
}

export function calculateSimpleIrrigation(input: SimplePlannerInput) {
  const mode = input.mode ?? "measured";
  const isEstimated = mode === "estimated" || mode === "demo";
  const result = calculateMeasuredReference(
    isEstimated ? { ...input, moisture: undefined } : input,
  );
  const assessment = {
    mode,
    canSaveReminder:
      mode === "measured" &&
      !result.paddy &&
      result.available &&
      result.nextIrrigationInDays !== undefined,
    confidence: mode === "demo" ? "demonstration" : "field-input-based",
    paddyBalance: undefined as ReturnType<typeof projectPaddyDay> | undefined,
    estimatedSoil: undefined as
      | {
          fieldCapacityPercent: number;
          wiltingPointPercent: number;
          rootDepthM: number;
          typicalTexture: boolean;
          referenceDepth: boolean;
        }
      | undefined,
  };
  if (result.paddy && !input.paddy) return { ...result, ...assessment };
  if (!isEstimated && !result.paddy) return { ...result, ...assessment };

  const missing: string[] = [];
  const area =
    input.area *
    (input.areaUnit.toLowerCase() === "hectare"
      ? 10000
      : input.areaUnit.toLowerCase() === "acre"
        ? 4046.856
        : NaN);
  const efficiency = irrigationEfficiency(input.method);
  if (!Number.isFinite(area) || area <= 0)
    missing.push("A positive field area in acres or hectares is required.");
  if (!efficiency)
    missing.push("Choose a method with a published efficiency range.");
  const etc = result.etcMaxMmPerDay;
  if (etc === undefined)
    missing.push(
      ...result.missing.filter(
        (item) => item.includes("crop coefficient") || item.includes("ETo"),
      ),
    );
  const clearMeasured = {
    measuredDepletionMm: undefined,
    depletionMm: undefined,
    tawMm: undefined,
    allowableDepletionMm: undefined,
    nextIrrigationInDays: undefined,
    needsSoilMeasurements: false,
  };

  if (result.paddy) {
    const pond = input.paddy ?? {};
    const rainMm =
      pond.rainMm ?? (isEstimated ? input.forecastRainfallMm : undefined);
    for (const [value, label] of [
      [pond.pondMm, "Standing water at the start of the day"],
      [pond.targetMm, "Target standing-water depth"],
      [pond.bundMm, "Bund overflow depth"],
      [pond.lossMm, "Daily seepage and percolation loss"],
      [rainMm, "Rainfall for the day (enter 0 if confirmed dry)"],
    ] as const) {
      if (value === undefined) missing.push(label);
    }
    const paddyBalance = projectPaddyDay({ ...pond, rainMm }, etc);
    if (!paddyBalance && missing.length === 0)
      missing.push(
        "Use positive pond and target depths within the bund height and valid daily losses and rain.",
      );
    if (paddyBalance?.pondExhausted)
      missing.push(
        "Standing water may run out. Check the field before estimating a refill.",
      );
    const available = !!paddyBalance && missing.length === 0;
    const net = available ? paddyBalance.netRequirementMm : undefined;
    return {
      ...result,
      ...clearMeasured,
      ...assessment,
      available,
      missing,
      paddyBalance,
      confidence: mode === "demo" ? "demonstration" : "one-day projection",
      irrigationDue: net === undefined ? undefined : net > 0,
      netRequirementMm: net,
      grossRequirementLitersMin:
        net === undefined ? undefined : (net * area * 100) / efficiency!.max,
      grossRequirementLitersMax:
        net === undefined ? undefined : (net * area * 100) / efficiency!.min,
      grossRainfallMm: rainMm,
      effectiveRainfallMm: paddyBalance?.effectiveRainfallMm,
      rainfallCreditMm: paddyBalance?.effectiveRainfallMm,
      rainfallNote:
        pond.rainMm === undefined
          ? "Model rainfall fills the pond up to the bund overflow depth."
          : "Entered rainfall fills the pond up to the bund overflow depth.",
      notes: [
        "One-day balance for an already flooded and saturated field. Rain is applied before ETc and loss. Land preparation, drainage and alternate wetting and drying are outside this model.",
      ],
    };
  }

  const soil = soilReference.soils.find(
    (row) => row.soil === matchIrrigationSoil(input.soil),
  );
  const root = cropWater.crops.find(
    (row) => normalizeCropName(row.crop) === normalizeCropName(input.crop),
  );
  const established = [
    "Flowering",
    "Fruit / grain formation",
    "Maturity",
  ].includes(input.growthStage);
  const moisture = input.moisture;
  const typicalTexture =
    moisture?.fieldCapacityPercent === undefined &&
    moisture?.wiltingPointPercent === undefined;
  const fc = typicalTexture
    ? soil?.fieldCapacityPercent
    : moisture?.fieldCapacityPercent;
  const wp = typicalTexture
    ? soil?.wiltingPointPercent
    : moisture?.wiltingPointPercent;
  const depth =
    moisture?.rootZoneDepthM ??
    (established ? root?.schedulingRootDepthM : undefined);
  if (!finiteBetween(fc, 0, 100) || !finiteBetween(wp, 0, 100) || fc <= wp)
    missing.push(
      "Choose a soil texture with a published water range, or enter both field capacity and wilting point.",
    );
  if (!finiteBetween(depth, 0.05, 3))
    missing.push(
      "Enter effective root depth. Reference depths are available only for configured crops with established roots.",
    );
  if (root?.depletionFractionP == null)
    missing.push("No verified crop allowable-depletion factor is configured.");
  const dates = balanceDates(input.moistureMeasuredDate, input.calculationDate);
  if (!input.baselineAtFieldCapacity)
    missing.push(
      "Confirm when the root zone was last at field capacity and that later watering was logged.",
    );
  if (!dates)
    missing.push("Use a starting date 1–14 days before the calculation date.");
  const estimatedSoil =
    finiteBetween(fc, 0, 100) &&
    finiteBetween(wp, 0, 100) &&
    fc > wp &&
    finiteBetween(depth, 0.05, 3)
      ? {
          fieldCapacityPercent: fc,
          wiltingPointPercent: wp,
          rootDepthM: depth,
          typicalTexture,
          referenceDepth: moisture?.rootZoneDepthM === undefined,
        }
      : undefined;
  const tawMm = estimatedSoil
    ? 10 *
      (estimatedSoil.fieldCapacityPercent - estimatedSoil.wiltingPointPercent) *
      estimatedSoil.rootDepthM
    : undefined;
  const balance =
    missing.length === 0 &&
    dates &&
    tawMm !== undefined &&
    result.kcMax !== undefined
      ? estimateRootZone({
          dates,
          weather: input.dailyWeather ?? [],
          kc: result.kcMax,
          tawMm,
          netWatering: input.irrigationEvents ?? [],
        })
      : null;
  if (!balance && missing.length === 0)
    missing.push(
      "Daily model ET₀ and rainfall are required for every date. Recorded watering must have a supported irrigation method.",
    );
  const raw =
    balance &&
    tawMm !== undefined &&
    root?.depletionFractionP != null &&
    etc !== undefined
      ? tawMm *
        Math.min(0.8, Math.max(0.1, root.depletionFractionP + 0.04 * (5 - etc)))
      : undefined;
  const due =
    raw !== undefined && balance ? balance.depletionMm >= raw : undefined;
  const net = due === undefined ? undefined : due ? balance!.depletionMm : 0;
  return {
    ...result,
    ...clearMeasured,
    ...assessment,
    available: net !== undefined,
    missing,
    estimatedSoil,
    tawMm,
    confidence:
      mode === "demo" ? "demonstration" : "model-based, check the field",
    depletionMm: balance?.depletionMm,
    allowableDepletionMm: raw,
    irrigationDue: due,
    netRequirementMm: net,
    grossRequirementLitersMin:
      net === undefined ? undefined : (net * area * 100) / efficiency!.max,
    grossRequirementLitersMax:
      net === undefined ? undefined : (net * area * 100) / efficiency!.min,
    balanceElapsedDays: balance?.elapsedDays ?? 0,
    grossRainfallMm: balance?.grossRainfallMm,
    effectiveRainfallMm: balance?.effectiveRainfallMm,
    rainfallCreditMm: balance?.effectiveRainfallMm,
    rainfallNote:
      "Model rainfall is credited up to available root-zone storage. Runoff and groundwater inputs are unavailable.",
    source: {
      ...result.source,
      soil: soil?.reference ?? "",
      root: root?.rootDepthReference ?? "",
    },
    notes: [
      "Starts at field capacity after free drainage, with one crop stage throughout. Uses the upper Kc when the reference gives a range. Credits logged watering at the lower published efficiency for the recorded method. No sensor measurement is inferred.",
    ],
  };
}

function calculateMeasuredReference(input: SimplePlannerInput) {
  const cropName = normalizeCropName(input.crop);
  const coefficientRow = cropKc.crops.find(
    (row) => normalizeCropName(row.crop) === cropName,
  );
  const rootRow = cropWater.crops.find(
    (row) => normalizeCropName(row.crop) === cropName,
  );
  const month =
    input.month ??
    Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        month: "numeric",
      }).format(new Date()),
    );
  const offlineEt0 = findOfflineEt0(input.state, input.district, month);
  const referenceEt0 = offlineEt0?.record;
  const isLive = input.weatherMode === "live";
  const et0MmDay = isLive ? input.liveEt0MmDay : referenceEt0?.et0MmDay;
  const et0 =
    Number.isFinite(et0MmDay) && (et0MmDay ?? 0) >= 0 ? et0MmDay : undefined;
  const soil = soilReference.soils.find(
    (row) => normalize(row.soil) === normalize(input.soil),
  );
  const methodName =
    input.method === "Furrow" ? "Surface/Flood Irrigation" : input.method;
  const method = efficiencyReference.methods.find(
    (row) => normalize(row.method) === normalize(methodName),
  );
  const stage = stageCoefficient(
    coefficientRow,
    input.growthStage,
    input.developmentProgressPercent,
  );
  const areaSquareMetres =
    input.areaUnit.toLowerCase() === "hectare"
      ? input.area * 10_000
      : input.areaUnit.toLowerCase() === "acre"
        ? input.area * 4046.856
        : NaN;
  const rice = cropName === "rice";
  const moisture = input.moisture;
  const moistureValuesPresent = [
    moisture?.fieldCapacityPercent,
    moisture?.wiltingPointPercent,
    moisture?.currentPercent,
    moisture?.rootZoneDepthM,
  ].every((value) => typeof value === "number" && Number.isFinite(value));
  const moistureOrderValid =
    moistureValuesPresent &&
    finiteBetween(moisture?.fieldCapacityPercent, 0, 100) &&
    finiteBetween(moisture?.wiltingPointPercent, 0, 100) &&
    finiteBetween(moisture?.currentPercent, 0, 100) &&
    finiteBetween(moisture?.rootZoneDepthM, 0.05, 3) &&
    moisture!.fieldCapacityPercent! > moisture!.wiltingPointPercent! &&
    moisture!.currentPercent! >= moisture!.wiltingPointPercent! &&
    moisture!.rootZoneDepthM! > 0;
  const missing: string[] = [];
  if (!coefficientRow || !stage)
    missing.push(
      coefficientRow && input.growthStage === "Vegetative"
        ? "The crop coefficient needs progress through vegetative growth. Enter it if known."
        : `No verified crop coefficient is configured for ${input.crop} at ${input.growthStage}.`,
    );
  if (isLive && et0 === undefined)
    missing.push(
      "Live weather did not provide a valid current-day ETo value. No historical value was substituted.",
    );
  if (!isLive && !referenceEt0)
    missing.push(
      "Insufficient Data: no verified offline ETo normal is configured for this district and month.",
    );
  if (!soil)
    missing.push("No soil reference is configured for this soil selection.");
  if (!rice && !moistureValuesPresent)
    missing.push(
      "Enter measured field capacity, wilting point, current soil moisture, and effective root-zone depth before calculating an irrigation amount.",
    );
  else if (!rice && !moistureOrderValid)
    missing.push(
      "Enter valid moisture percentages and root depth. Field capacity must exceed wilting point, and current moisture must be at or above wilting point.",
    );
  if (
    !rootRow ||
    rootRow.depletionFractionP === null ||
    !Number.isFinite(rootRow.depletionFractionP)
  )
    missing.push("No verified crop allowable-depletion factor is configured.");
  if (
    !method ||
    method.efficiencyPercent.min <= 0 ||
    method.efficiencyPercent.max > 100 ||
    method.efficiencyPercent.min > method.efficiencyPercent.max
  )
    missing.push(
      "No valid irrigation efficiency range is configured for this method.",
    );
  if (!Number.isFinite(areaSquareMetres) || areaSquareMetres <= 0)
    missing.push("Farm area must be a positive value in acres or hectares.");
  if (rice)
    missing.push(
      "Rice/paddy dose is unavailable without a separate balance for ponding, seepage, and percolation.",
    );

  const kcMin = stage?.min;
  const kcMax = stage?.max;
  const etcMin =
    et0 !== undefined && kcMin !== undefined ? et0 * kcMin : undefined;
  const etcMax =
    et0 !== undefined && kcMax !== undefined ? et0 * kcMax : undefined;
  const cropDemandAvailable = etcMin !== undefined && etcMax !== undefined;
  const adjustedPMin =
    rootRow?.depletionFractionP !== null &&
    rootRow?.depletionFractionP !== undefined &&
    etcMax !== undefined
      ? rootRow.depletionFractionP + 0.04 * (5 - etcMax)
      : undefined;
  const adjustedPMax =
    rootRow?.depletionFractionP !== null &&
    rootRow?.depletionFractionP !== undefined &&
    etcMin !== undefined
      ? rootRow.depletionFractionP + 0.04 * (5 - etcMin)
      : undefined;
  if (
    adjustedPMin !== undefined &&
    adjustedPMax !== undefined &&
    (adjustedPMin <= 0 || adjustedPMax > 1)
  )
    missing.push(
      "The FAO-56 adjusted allowable-depletion fraction falls outside 0–1 for these reference conditions.",
    );
  const canCalculate =
    missing.length === 0 &&
    cropDemandAvailable &&
    soil !== undefined &&
    method !== undefined &&
    rootRow !== undefined &&
    moistureOrderValid;
  let tawMm: number | undefined;
  let measuredDepletionMm: number | undefined;
  let depletionMm: number | undefined;
  let allowableDepletionMm: number | undefined;
  let netRequirementMm: number | undefined;
  let grossRequirementLitersMin: number | undefined;
  let grossRequirementLitersMax: number | undefined;
  let nextIrrigationInDays: number | undefined;
  let irrigationDue: boolean | undefined;
  let effectiveRainfallMm = 0;
  let balanceElapsedDays = 0;
  if (!rice && moistureOrderValid) {
    const depth = moisture!.rootZoneDepthM!;
    const thetaFc = moisture!.fieldCapacityPercent! / 100;
    const thetaWp = moisture!.wiltingPointPercent! / 100;
    const thetaCurrent = moisture!.currentPercent! / 100;
    tawMm = 1000 * (thetaFc - thetaWp) * depth;
    measuredDepletionMm = Math.min(
      tawMm,
      Math.max(0, 1000 * (thetaFc - thetaCurrent) * depth),
    );
    depletionMm = measuredDepletionMm;
    if (etcMax !== undefined) {
      const moistureMeasuredDate =
        input.moistureMeasuredDate ??
        input.calculationDate ??
        indiaCalendarDate();
      const calculationDate = input.calculationDate ?? indiaCalendarDate();
      const projection = projectRootZoneDepletion({
        measuredDepletionMm,
        tawMm,
        etcMmPerDay: etcMax,
        moistureMeasuredDate,
        calculationDate,
        rainfallEvents: input.rainfallEvents,
        irrigationEvents: input.irrigationEvents,
      });
      depletionMm = projection.depletionMm;
      effectiveRainfallMm = projection.effectiveRainfallMm;
      balanceElapsedDays = projection.elapsedDays;
    }
  }
  const moistureMeasuredDate =
    input.moistureMeasuredDate ?? input.calculationDate ?? indiaCalendarDate();
  const calculationDate = input.calculationDate ?? indiaCalendarDate();
  const observedEvents = (input.rainfallEvents ?? []).filter(
    (event) =>
      rainfallCreditEligibility({
        source: event.source,
        rainfallDate: event.date,
        moistureMeasuredDate,
        today: calculationDate,
        recordedMoistureMeasuredDate: event.moistureMeasuredDate,
      }) === "ELIGIBLE" && event.date <= calculationDate,
  );
  const rainfallSource = [
    ...new Set(observedEvents.map((event) => event.source)),
  ].join(", ");
  const rainfallTimestamp = input.rainfallEvents
    ?.filter((event) =>
      observedEvents.some(
        (observed) =>
          observed.date === event.date && observed.source === event.source,
      ),
    )
    .map((event) => event.recordedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const rainfallNote = rice
    ? "Rainfall is shown for context. The planner does not calculate effective rainfall for paddy."
    : observedEvents.length && !moistureOrderValid
      ? "Observed rainfall is recorded. Enter measured soil values to calculate the root-zone balance."
      : observedEvents.length
        ? observedEvents.every((event) => event.effectiveMm === null)
          ? "Observed rainfall is recorded, but effective rainfall could not be estimated from measured runoff and root-zone storage; no rainfall deduction was applied."
          : "Only observed manual/station rainfall dated after the soil-moisture reading is credited. Rain on or before the reading is assumed reflected in measured moisture; forecast and climate normals are never deducted."
        : "No qualifying observed rainfall is recorded after the soil-moisture reading. No rainfall deduction was applied; forecast/model rainfall and historical climate normals are shown separately.";
  if (
    canCalculate &&
    tawMm !== undefined &&
    depletionMm !== undefined &&
    etcMin !== undefined &&
    etcMax !== undefined &&
    rootRow &&
    method
  ) {
    // FAO-56 adjusts the tabulated p value for ETc: p = p_table + 0.04(5 - ETc).
    allowableDepletionMm = tawMm * Math.min(adjustedPMin!, adjustedPMax!);
    irrigationDue = depletionMm >= allowableDepletionMm;
    netRequirementMm = irrigationDue ? depletionMm : 0;
    const netLiters = netRequirementMm * areaSquareMetres;
    grossRequirementLitersMin =
      netLiters / (method.efficiencyPercent.max / 100);
    grossRequirementLitersMax =
      netLiters / (method.efficiencyPercent.min / 100);
    nextIrrigationInDays = irrigationDue
      ? 0
      : etcMax > 0
        ? Math.ceil((allowableDepletionMm - depletionMm) / etcMax)
        : undefined;
  }

  const sourceClimate = isLive
    ? `Open-Meteo model ETo${input.liveWeatherDate ? ` (${input.liveWeatherDate})` : ""}; not measured station weather.`
    : `${offlineEt0?.source ?? offlineEt0DatasetMeta.source}; reference period ${offlineEt0?.referencePeriod ?? offlineEt0DatasetMeta.sourcePeriod}; dataset ${offlineEt0?.datasetVersion ?? offlineEt0DatasetMeta.datasetVersion}. Historical climate normal, not live weather.`;
  const et0Location =
    !isLive && offlineEt0
      ? `${offlineEt0.aliasUsed ? `${input.district} resolved as ` : ""}${offlineEt0.district}, ${offlineEt0.state}; district-centroid reference, not a district area average.`
      : "";
  return {
    available: canCalculate,
    paddy: rice,
    needsSoilMeasurements: !rice && !moistureOrderValid,
    weatherMode: isLive ? ("live" as const) : ("offline" as const),
    cropDemandAvailable,
    missing,
    et0MmPerDay: et0,
    kcMin,
    kcMax,
    etcMinMmPerDay: etcMin,
    etcMaxMmPerDay: etcMax,
    tawMm,
    depletionMm,
    allowableDepletionMm,
    netRequirementMm,
    grossRequirementLitersMin,
    grossRequirementLitersMax,
    irrigationDue,
    nextIrrigationInDays,
    measuredDepletionMm,
    balanceElapsedDays,
    grossRainfallMm: observedEvents.reduce(
      (sum, event) => sum + event.grossMm,
      0,
    ),
    effectiveRainfallMm,
    rainfallCreditMm: effectiveRainfallMm,
    rainfallSource: rainfallSource || "No qualifying observed rainfall",
    rainfallTimestamp,
    forecastRainfallMm: input.forecastRainfallMm,
    forecastRainfallDate: input.forecastRainfallDate,
    weatherRetrievedAt: input.weatherRetrievedAt,
    liveWeatherDate: input.liveWeatherDate,
    forecastScenarios: (input.rainfallEvents ?? [])
      .filter((event) => event.source === "FORECAST")
      .map((event) => ({
        date: event.date,
        grossMm: event.grossMm,
        recordedAt: event.recordedAt,
      })),
    rainfallNote,
    source: {
      climate: sourceClimate,
      climateLocation: isLive ? (input.weatherLocation ?? "") : et0Location,
      districtResolutionSourceUrl: isLive
        ? undefined
        : offlineEt0?.districtResolutionSourceUrl,
      climateSourceUrl: isLive
        ? "https://open-meteo.com/"
        : (offlineEt0?.sourceUrl ?? offlineEt0DatasetMeta.sourceUrl),
      climateVerification: isLive
        ? "Daily model estimate from Open-Meteo; not an observed station value."
        : (offlineEt0?.verificationStatus ??
          offlineEt0DatasetMeta.verificationStatus),
      climateUnits: isLive
        ? "mm/day"
        : (offlineEt0?.units.et0MmDay ?? offlineEt0DatasetMeta.units.et0MmDay),
      climateMonth: month,
      climateVersion: isLive
        ? "Open-Meteo live API response"
        : (offlineEt0?.datasetVersion ?? offlineEt0DatasetMeta.datasetVersion),
      crop: coefficientRow?.reference ?? "",
      cropUrl: coefficientRow?.referenceUrl ?? cropKc.meta.sourceUrl,
      cropVerification: coefficientRow?.verificationStatus ?? "UNCONFIGURED",
      soil:
        !rice && moistureOrderValid
          ? `Measured field capacity, wilting point, current moisture, and root-zone depth entered by farmer. ${soil?.reference ?? ""} Typical texture reference is context only, not substituted for measurements.`
          : (soil?.reference ?? ""),
      root: rootRow?.reference ?? "",
      method: method
        ? `${method.source}; published efficiency range ${method.efficiencyPercent.min}–${method.efficiencyPercent.max}%`
        : "",
      links: plannerConfig.meta.sources,
    },
    notes: plannerConfig.meta.limitations,
  };
}

function stageCoefficient(
  row: (typeof cropKc.crops)[number] | undefined,
  stage: string,
  progress?: number,
) {
  if (!row) return undefined;
  if (stage === "Establishment") return numericRange(row.initial);
  if (stage === "Vegetative") {
    const published = numericRange(row.development);
    if (published) return published;
    const initial = numericRange(row.initial);
    const mid = numericRange(row.midSeason);
    if (initial && mid && finiteBetween(progress, 0, 100)) {
      const fraction = progress / 100;
      return {
        min: initial.min + fraction * (mid.min - initial.min),
        max: initial.max + fraction * (mid.max - initial.max),
      };
    }
    return undefined;
  }
  if (stage === "Flowering" || stage === "Fruit / grain formation")
    return numericRange(row.midSeason);
  if (stage === "Maturity") return numericRange(row.lateSeason);
  return undefined;
}
function numericRange(
  value: number | { min: number; max: number } | null | undefined,
) {
  if (typeof value === "number" && Number.isFinite(value))
    return { min: value, max: value };
  if (
    value &&
    typeof value === "object" &&
    Number.isFinite(value.min) &&
    Number.isFinite(value.max)
  )
    return { min: value.min, max: value.max };
  return undefined;
}
function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
export function normalizeCropName(value: string) {
  const name = normalize(value).replace(/\s*\([^)]*\)\s*$/, "");
  if (name === "corn") return "maize";
  if (name === "paddy") return "rice";
  if (name === "canola") return "rapeseed";
  if (name === "chick pea" || name === "gram") return "chickpea";
  return name;
}
