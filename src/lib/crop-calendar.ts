import dataset from "@/data/crop-calendar.json";
import { calculateIcarFertilizer, getIcarRecipes } from "@/lib/icar-fertilizer";

export const cropCalendarDatasetVersion = dataset.version;
export const cropCalendarProfileNames = dataset.crops.map(profile => profile.crop);
export type CropCalendarProfile = (typeof dataset.crops)[number] & { requiresVariety?: boolean };
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

const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export function findCropCalendarProfile(cropName: string): CropCalendarProfile | undefined {
  const name = normalize(cropName);
  return dataset.crops.find(profile => normalize(profile.crop) === name || profile.aliases.some(alias => normalize(alias) === name));
}

export function getCropCalendarProfileOptions(cropName: string) {
  const profile = findCropCalendarProfile(cropName);
  return {
    hasCalendarProfile: Boolean(profile),
    requiresVariety: profile?.requiresVariety ?? false,
    varietyOptions: profile?.varieties.map(item => item.name) ?? [],
  };
}

export function selectCropDuration(profile: CropCalendarProfile, variety?: string | null, farmerDurationDays?: number | null) {
  const chosen = variety?.trim();
  const varietyProfile = chosen ? profile.varieties.find(item => normalize(item.name) === normalize(chosen)) : undefined;
  if (profile.requiresVariety && !varietyProfile) {
    throw new Error(`Select a millet type or variety from the available options: ${profile.varieties.map(item => item.name).join(", ")}.`);
  }
  const source = varietyProfile && "source" in varietyProfile && typeof varietyProfile.source === "string" ? varietyProfile.source : profile.source;
  const sourceUrl = varietyProfile && "sourceUrl" in varietyProfile && typeof varietyProfile.sourceUrl === "string" ? varietyProfile.sourceUrl : profile.sourceUrl;
  if (farmerDurationDays && Number.isInteger(farmerDurationDays) && farmerDurationDays > 0) {
    return { days: farmerDurationDays, range: null as [number, number] | null, basis: "Farmer-entered duration", isFarmerEntered: true, source, sourceUrl };
  }
  return {
    days: varietyProfile?.days ?? profile.typicalDays,
    range: (varietyProfile && "durationRange" in varietyProfile ? varietyProfile.durationRange : profile.durationRange) as [number, number],
    basis: varietyProfile ? `${varietyProfile.name} source-reported planning profile` : "Typical source-profile planning estimate",
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
  if (!profile) throw new Error(`No offline calendar profile is configured for “${input.cropName}”. Supported crops: ${cropCalendarProfileNames.join(", ")}. No schedule was generated.`);
  if (!profile.seasons.includes(input.season)) throw new Error(`${profile.crop} is configured for ${profile.seasons.join(", ")} in this calendar dataset. Check the crop season before generating.`);
  const duration = selectCropDuration(profile, input.variety, input.durationDays);
  const dateAt = (day: number) => {
    const date = new Date(input.sowingDate);
    date.setUTCDate(date.getUTCDate() + day);
    return date;
  };
  const result: GeneratedCalendarActivity[] = [];
  const add = (activity: Omit<GeneratedCalendarActivity, "scheduledDate"> & { day: number }) => {
    const { day, ...activityData } = activity;
    result.push({ ...activityData, scheduledDate: dateAt(day) });
  };
  const estimated = `Planning estimate based on ${duration.basis} (${duration.days} days; source range ${duration.range?.join("–") ?? "not supplied"} days). Confirm actual stages in the local agricultural university/KVK advisory.`;
  const monitoringNote = "Observation reminder only. It does not prescribe a pesticide, fertilizer dose, or irrigation quantity.";
  const ruleSource = duration.source;
  const ruleSourceUrl = duration.sourceUrl;
  for (const rule of dataset.lifecycleRules.preSowing) add({
    activityKey: rule.key, activityName: rule.name, activityType: rule.type, growthStage: rule.growthStage,
    day: rule.das, description: `${rule.description} ${monitoringNote}`, recommendation: rule.recommendation,
    source: ruleSource, sourceUrl: ruleSourceUrl,
  });
  const sowing = dataset.lifecycleRules.sowing;
  add({ activityKey: sowing.key, activityName: sowing.name, activityType: sowing.type, growthStage: sowing.growthStage,
    day: sowing.das, description: `Crop Management sowing date. The ${duration.days}-day maturity estimate is a planning reference, not a suitability decision.`,
    recommendation: "Confirm sowing window and variety with the state agricultural university or KVK for this district.", source: ruleSource, sourceUrl: ruleSourceUrl });
  for (const rule of dataset.lifecycleRules.observationCheckpoints) {
    const das = "maxDas" in rule && rule.maxDas ? Math.min(rule.maxDas, Math.round(duration.days * rule.fraction)) : Math.round(duration.days * rule.fraction);
    add({ activityKey: rule.key, activityName: rule.name, activityType: rule.type, growthStage: rule.growthStage,
      day: das, description: `${estimated} ${monitoringNote}`, recommendation: rule.recommendation,
      source: ruleSource, sourceUrl: ruleSourceUrl });
  }

  const recipes = getIcarRecipes(input.cropName, input.state, input.district);
  const recipe = recipes[0];
  if (recipe && Number.isFinite(input.areaHa) && input.areaHa > 0) {
    const plan = calculateIcarFertilizer(recipe, input.areaHa);
    for (const [index, split] of plan.schedule.entries()) {
      const day = fertilizerDay(split.label);
      if (day === null) continue;
      const quantity = `Calculated for ${input.areaHa.toFixed(3)} ha using the existing ICAR fertilizer calculator: Urea ${split.urea.toFixed(1)} kg, DAP ${split.dap.toFixed(1)} kg, MOP ${split.mop.toFixed(1)} kg.`;
      add({ activityKey: `fertilizer-${recipe.id}-${index}`, activityName: `Fertilizer application · ${split.label}`, activityType: "FERTILIZER", growthStage: split.label, day, description: `${recipe.conditions} ${quantity}`, recommendation: `Source schedule: ${split.label}. Verify with current soil-test and local extension guidance before application.`, source: recipe.source.title, sourceUrl: recipe.source.url });
    }
  }
  return { profile, duration, activities: result.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime()), estimatedHarvestDate: dateAt(duration.days), fertilizerProfileMatched: Boolean(recipe), geographicScopeNote: profile.scope };
}

function fertilizerDay(label: string): number | null {
  if (/at sowing|basal|puddling|transplanting/i.test(label)) return 0;
  const weeks = label.match(/(\d+)\s*weeks?/i);
  if (weeks) return Number(weeks[1]) * 7;
  const days = label.match(/(\d+)\s*(?:days?|DAS)/i);
  if (days) return Number(days[1]);
  return null;
}

export function toHectares(area: number, unit: string) {
  return unit.toLowerCase().startsWith("hect") ? area : area * 0.4046856422;
}
