export type KcReferencePoint = {
  stageName: string;
  value: number;
  startDay: number | null;
  endDay: number | null;
  source: string;
  sourceUrl: string;
  publicationTitle: string | null;
  publicationYear: number | null;
  tableReference: string | null;
};
export type DailyEtcReference = {
  date: string;
  cropDay: number;
  stageName: string;
  kc: number;
  et0Mm: number;
  etcMm: number;
};

const stageOrder = [
  "initial stage",
  "crop development stage",
  "mid-season stage",
  "late season stage",
];

function orderOf(point: KcReferencePoint) {
  const name = point.stageName.toLowerCase();
  return stageOrder.findIndex((stage) => name.includes(stage));
}

export function mapFarmerStageToFaoStage(stage: string) {
  const normalized = stage.trim().toLowerCase();
  if (normalized === "establishment") return "Initial stage";
  if (normalized === "vegetative") return "Crop development stage";
  if (normalized === "flowering" || normalized === "fruit / grain formation")
    return "Mid-season stage";
  if (normalized === "maturity") return "Late season stage";
  return undefined;
}

/** Resolves a generic FAO stage curve from source-backed stage points and crop-day durations. */
export function calculateMaizeEtcReference(
  days: Array<{ date: string; et0Mm: number | null }>,
  sowingDate: string | null,
  expectedHarvestDate: string | null,
  inputPoints: KcReferencePoint[],
) {
  if (!sowingDate) return { daily: [], reason: "missing-sowing-date" as const };
  const points = inputPoints
    .filter((point) => orderOf(point) >= 0)
    .sort((a, b) => orderOf(a) - orderOf(b));
  if (
    points.length !== 4 ||
    points.some(
      (point) =>
        point.startDay === null ||
        point.endDay === null ||
        !Number.isFinite(point.value) ||
        point.value < 0 ||
        !point.sourceUrl.startsWith("https://"),
    )
  ) {
    return { daily: [], reason: "missing-stage-data" as const };
  }
  if (
    points[0].startDay !== 1 ||
    points.some(
      (point, index) =>
        point.startDay! > point.endDay! ||
        (index > 0 && point.startDay !== points[index - 1].endDay! + 1),
    )
  ) {
    return { daily: [], reason: "invalid-stage-duration" as const };
  }
  const lastDay = points[3].endDay!;
  const sowingTime = Date.parse(`${sowingDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(sowingTime))
    return { daily: [], reason: "invalid-sowing-date" as const };
  if (expectedHarvestDate) {
    const harvestTime = Date.parse(
      `${expectedHarvestDate.slice(0, 10)}T00:00:00Z`,
    );
    if (!Number.isFinite(harvestTime))
      return { daily: [], reason: "invalid-harvest-date" as const };
    const recordedDuration =
      Math.floor((harvestTime - sowingTime) / 86_400_000) + 1;
    if (recordedDuration !== lastDay)
      return { daily: [], reason: "cycle-length-mismatch" as const };
  }
  const [initial, , mid, late] = points;
  const daily: DailyEtcReference[] = [];
  for (const day of days) {
    if (day.et0Mm === null || !Number.isFinite(day.et0Mm) || day.et0Mm < 0)
      return { daily: [], reason: "incomplete-et0" as const };
    const dayTime = Date.parse(`${day.date.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(dayTime))
      return { daily: [], reason: "invalid-forecast-date" as const };
    const cropDay = Math.floor((dayTime - sowingTime) / 86_400_000) + 1;
    const current = points.find(
      (point) => cropDay >= point.startDay! && cropDay <= point.endDay!,
    );
    if (!current)
      return {
        daily: [],
        reason:
          cropDay < 1
            ? ("forecast-before-sowing" as const)
            : ("forecast-after-cycle" as const),
      };
    let kc: number;
    const progress =
      (cropDay - current.startDay!) /
      Math.max(1, current.endDay! - current.startDay!);
    if (orderOf(current) === 0) kc = initial.value;
    else if (orderOf(current) === 1)
      kc = initial.value + progress * (mid.value - initial.value);
    else if (orderOf(current) === 2) kc = mid.value;
    else kc = mid.value + progress * (late.value - mid.value);
    daily.push({
      date: day.date,
      cropDay,
      stageName: current.stageName,
      kc,
      et0Mm: day.et0Mm,
      etcMm: day.et0Mm * kc,
    });
  }
  return {
    daily,
    weeklyEtcMm: daily.reduce((sum, day) => sum + day.etcMm, 0),
    source: points[0].source,
    sourceUrl: points[0].sourceUrl,
    publicationTitle: points[0].publicationTitle,
    publicationYear: points[0].publicationYear,
    tableReference: points[0].tableReference,
    reason: undefined,
  };
}
