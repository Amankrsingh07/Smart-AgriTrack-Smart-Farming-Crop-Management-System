import dataset from "@/data/crop-calendar.json";
import growthStageDataset from "@/data/crop-growth-stages.json";

export const cropCalendarDatasetVersion = `${dataset.version}+${growthStageDataset.version}`;
export const cropCalendarProfileNames = dataset.crops.map(
  (profile) => profile.crop,
);
export const cropGrowthStageDatasetVersion = growthStageDataset.version;
export type CropCalendarProfile = (typeof dataset.crops)[number] & {
  requiresVariety?: boolean;
};
export type GeneratedCalendarActivity = {
  activityKey: string;
  activityName: string;
  activityType: string;
  growthStage: string | null;
  scheduledDate: Date;
  description: string;
  recommendation: string | null;
  source: string | null;
  sourceUrl: string | null;
};

export type CropGrowthWindow = {
  key: string;
  name: string;
  startDay: number;
  endDay: number;
  description: string;
  recommendation: string;
};

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export class CropCalendarCoverageError extends Error {}

export function findCropCalendarProfile(
  cropName: string,
): CropCalendarProfile | undefined {
  const name = normalize(cropName);
  return dataset.crops.find(
    (profile) =>
      normalize(profile.crop) === name ||
      profile.aliases.some((alias) => normalize(alias) === name),
  );
}

export function getCropCalendarProfileOptions(cropName: string) {
  const profile = findCropCalendarProfile(cropName);
  return {
    hasCalendarProfile: Boolean(profile),
    requiresVariety: profile?.requiresVariety ?? false,
    varietyOptions: profile?.varieties.map((item) => item.name) ?? [],
  };
}

export function getCropGrowthStageProfile(cropName: string) {
  const cropProfile = findCropCalendarProfile(cropName);
  if (!cropProfile) return undefined;
  return growthStageDataset.crops.find(
    (item) => normalize(item.crop) === normalize(cropProfile.crop),
  );
}

export function calculateCropGrowthWindows(
  cropName: string,
  durationDays: number,
): CropGrowthWindow[] {
  const profile = getCropGrowthStageProfile(cropName);
  if (!profile || !Number.isInteger(durationDays) || durationDays < 8)
    return [];
  const [initialPct, developmentPct, midPct] = profile.stagesPercent;
  const initial = Math.max(1, Math.round((durationDays * initialPct) / 100));
  const development = Math.max(
    1,
    Math.round((durationDays * developmentPct) / 100),
  );
  const mid = Math.max(1, Math.round((durationDays * midPct) / 100));
  const initialEnd = initial;
  const developmentEnd = initialEnd + development;
  const midEnd = developmentEnd + mid;
  const germinationEnd = Math.max(2, Math.round(initial * 0.35));
  const splitDevelopment = Math.max(1, Math.round(development * 0.55));
  const floweringEnd = Math.min(
    midEnd,
    developmentEnd + Math.max(1, Math.round(mid * 0.3)),
  );
  const stages: Array<
    Omit<CropGrowthWindow, "description" | "recommendation"> & {
      description: string;
      recommendation: string;
    }
  > = [
    {
      key: "sowing",
      name: "Sowing",
      startDay: 0,
      endDay: 0,
      description:
        "Seed or planting material is placed in the field. This is the start date recorded in Crop Management.",
      recommendation:
        "Confirm seed, spacing and sowing method with the crop-specific local advisory.",
    },
    {
      key: "germination",
      name: "Germination",
      startDay: 1,
      endDay: Math.min(initialEnd, germinationEnd),
      description:
        "Seeds are expected to imbibe and emerge during this early establishment period.",
      recommendation:
        "Check field moisture and emergence. Record gaps; do not infer irrigation quantity from the calendar.",
    },
    {
      key: "seedling",
      name: "Seedling",
      startDay: Math.min(initialEnd, germinationEnd) + 1,
      endDay: initialEnd,
      description:
        "Young plants establish their first leaves and root system during the remainder of the initial stage.",
      recommendation:
        "Inspect plant stand, weeds and visible pest or disease symptoms; use local guidance for any intervention.",
    },
    {
      key: "vegetative",
      name: "Vegetative growth",
      startDay: initialEnd + 1,
      endDay: profile.includesTillering
        ? initialEnd + splitDevelopment
        : developmentEnd,
      description:
        "The crop develops leaves, stems and canopy. Stage duration is estimated from the selected crop profile.",
      recommendation:
        "Inspect weeds and crop vigor. Review irrigation using measured field conditions and the existing Smart Irrigation Planner.",
    },
    ...(profile.includesTillering
      ? [
          {
            key: "tillering",
            name: "Tillering",
            startDay: initialEnd + splitDevelopment + 1,
            endDay: developmentEnd,
            description:
              "Cereal tillers may develop during this part of vegetative growth; the timing varies by variety and field conditions.",
            recommendation:
              "Observe tiller or shoot development and continue weed, moisture and pest scouting.",
          },
        ]
      : []),
    {
      key: "flowering",
      name: "Flowering",
      startDay: developmentEnd + 1,
      endDay: floweringEnd,
      description:
        "Flowering is expected within the crop mid-season period. Calendar timing is an estimate, not an observation.",
      recommendation:
        "Inspect flowering and weather stress. Maintain field monitoring and follow locally approved nutrient guidance.",
    },
    {
      key: "grain-fruit",
      name: "Grain / fruit formation",
      startDay: floweringEnd + 1,
      endDay: midEnd,
      description:
        "Grain, pod, tuber or fruit development is expected during the remaining mid-season period.",
      recommendation:
        "Monitor crop development, moisture and pests. Check nutrient needs against soil testing and local recommendations; no dose is generated here.",
    },
    {
      key: "maturity",
      name: "Maturity",
      startDay: midEnd + 1,
      endDay: Math.max(midEnd + 1, durationDays - 1),
      description:
        "The crop enters the estimated late-season or ripening period before harvest.",
      recommendation:
        "Check crop-specific maturity signs and prepare labor, storage and market plans. Confirm timing with local extension guidance.",
    },
    {
      key: "harvesting",
      name: "Harvesting",
      startDay: durationDays,
      endDay: durationDays,
      description:
        "The source-profile harvest date is a planning estimate for the last day of a typical growing period.",
      recommendation:
        "Harvest only after checking field maturity, weather, equipment and local guidance.",
    },
  ];
  return stages
    .filter((stage) => stage.startDay <= durationDays)
    .map((stage) => ({
      ...stage,
      endDay: Math.min(durationDays, stage.endDay),
    }));
}

export function selectCropDuration(
  profile: CropCalendarProfile,
  variety?: string | null,
  farmerDurationDays?: number | null,
) {
  const chosen = variety?.trim();
  const varietyProfile = chosen
    ? profile.varieties.find(
        (item) => normalize(item.name) === normalize(chosen),
      )
    : undefined;
  if (profile.requiresVariety && !varietyProfile) {
    throw new CropCalendarCoverageError(
      `Select a millet type or variety from the available options: ${profile.varieties.map((item) => item.name).join(", ")}.`,
    );
  }
  const source =
    varietyProfile &&
    "source" in varietyProfile &&
    typeof varietyProfile.source === "string"
      ? varietyProfile.source
      : profile.source;
  const sourceUrl =
    varietyProfile &&
    "sourceUrl" in varietyProfile &&
    typeof varietyProfile.sourceUrl === "string"
      ? varietyProfile.sourceUrl
      : profile.sourceUrl;
  if (
    farmerDurationDays &&
    Number.isInteger(farmerDurationDays) &&
    farmerDurationDays > 0
  ) {
    return {
      days: farmerDurationDays,
      range: null as [number, number] | null,
      basis: "Farmer-entered duration",
      isFarmerEntered: true,
      source,
      sourceUrl,
    };
  }
  return {
    days: varietyProfile?.days ?? profile.typicalDays,
    range: (varietyProfile && "durationRange" in varietyProfile
      ? varietyProfile.durationRange
      : profile.durationRange) as [number, number],
    basis: varietyProfile
      ? `${varietyProfile.name} source-reported planning profile`
      : "Typical source-profile planning estimate",
    isFarmerEntered: false,
    source,
    sourceUrl,
  };
}

export function generateCropCalendarActivities(input: {
  cropName: string;
  state: string;
  district: string;
  season: string;
  sowingDate: Date;
  variety?: string | null;
  durationDays?: number | null;
  areaHa: number;
}) {
  const profile = findCropCalendarProfile(input.cropName);
  if (!profile)
    throw new CropCalendarCoverageError(
      `No offline calendar profile is configured for “${input.cropName}”. Supported crops: ${cropCalendarProfileNames.join(", ")}. No schedule was generated.`,
    );
  if (!profile.seasons.includes(input.season))
    throw new CropCalendarCoverageError(
      `${profile.crop} is configured for ${profile.seasons.join(", ")} in this calendar dataset. Check the crop season before generating.`,
    );
  const duration = selectCropDuration(
    profile,
    input.variety,
    input.durationDays,
  );
  const dateAt = (day: number) => {
    const date = new Date(input.sowingDate);
    date.setUTCDate(date.getUTCDate() + day);
    return date;
  };
  const result: GeneratedCalendarActivity[] = [];
  const add = (
    activity: Omit<GeneratedCalendarActivity, "scheduledDate"> & {
      day: number;
    },
  ) => {
    const { day, ...activityData } = activity;
    result.push({ ...activityData, scheduledDate: dateAt(day) });
  };
  const estimated = `Planning estimate based on ${duration.basis} (${duration.days} days; source range ${duration.range?.join("–") ?? "not supplied"} days). Confirm actual stages in the local agricultural university/KVK advisory.`;
  const monitoringNote =
    "Observation reminder only. It does not prescribe a pesticide, fertilizer dose, or irrigation quantity.";
  const ruleSource = duration.source;
  const ruleSourceUrl = duration.sourceUrl;
  for (const rule of dataset.lifecycleRules.preSowing)
    add({
      activityKey: rule.key,
      activityName: rule.name,
      activityType: rule.type,
      growthStage: rule.growthStage,
      day: rule.das,
      description: `${rule.description} ${monitoringNote}`,
      recommendation: rule.recommendation,
      source: ruleSource,
      sourceUrl: ruleSourceUrl,
    });
  const sowing = dataset.lifecycleRules.sowing;
  add({
    activityKey: sowing.key,
    activityName: sowing.name,
    activityType: sowing.type,
    growthStage: "Sowing",
    day: sowing.das,
    description: `Crop Management sowing date. The ${duration.days}-day maturity estimate is a planning reference, not a suitability decision.`,
    recommendation:
      "Confirm sowing window and variety with the state agricultural university or KVK for this district.",
    source: ruleSource,
    sourceUrl: ruleSourceUrl,
  });
  const stageProfile = getCropGrowthStageProfile(input.cropName);
  const growthWindows = calculateCropGrowthWindows(
    input.cropName,
    duration.days,
  );
  for (const stage of growthWindows.filter((item) => item.key !== "sowing"))
    add({
      activityKey: `phase-${stage.key}`,
      activityName: `${stage.name} stage`,
      activityType: "GROWTH_STAGE",
      growthStage: stage.name,
      day: stage.startDay,
      description: `${estimated} ${stage.description} Expected stage window: day ${stage.startDay} to ${stage.endDay} after sowing.`,
      recommendation: stage.recommendation,
      source: stageProfile?.source ?? ruleSource,
      sourceUrl: stageProfile?.sourceUrl ?? ruleSourceUrl,
    });
  if (duration.range) {
    add({
      activityKey: "harvest-window-start",
      activityName: "Expected harvest window opens",
      activityType: "HARVEST",
      growthStage: "Harvest window",
      day: duration.range[0],
      description: `Lower end of the source-profile harvest range (${duration.range[0]} days after sowing). Actual maturity depends on variety and local conditions.`,
      recommendation:
        "Inspect crop-specific maturity indicators before harvesting; this date is not a harvest instruction.",
      source: ruleSource,
      sourceUrl: ruleSourceUrl,
    });
    add({
      activityKey: "harvest-window-end",
      activityName: "Expected harvest window closes",
      activityType: "HARVEST",
      growthStage: "Harvest window",
      day: duration.range[1],
      description: `Upper end of the source-profile harvest range (${duration.range[1]} days after sowing). Confirm field maturity locally.`,
      recommendation:
        "Use field observations and local extension guidance to confirm harvest timing.",
      source: ruleSource,
      sourceUrl: ruleSourceUrl,
    });
  }
  for (const rule of dataset.lifecycleRules.observationCheckpoints) {
    const das =
      "maxDas" in rule && rule.maxDas
        ? Math.min(rule.maxDas, Math.round(duration.days * rule.fraction))
        : Math.round(duration.days * rule.fraction);
    add({
      activityKey: rule.key,
      activityName: rule.name,
      activityType: rule.type,
      growthStage: rule.growthStage,
      day: das,
      description: `${estimated} ${monitoringNote}`,
      recommendation: rule.recommendation,
      source: ruleSource,
      sourceUrl: ruleSourceUrl,
    });
  }

  return {
    profile,
    duration,
    activities: result.sort(
      (a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime(),
    ),
    estimatedHarvestDate: dateAt(duration.days),
    fertilizerProfileMatched: false,
    geographicScopeNote: profile.scope,
  };
}

export function toHectares(area: number, unit: string) {
  return unit.toLowerCase().startsWith("hect") ? area : area * 0.4046856422;
}
