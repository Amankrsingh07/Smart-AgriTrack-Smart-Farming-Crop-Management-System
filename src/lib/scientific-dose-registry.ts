import gfr from "@/data/fertilizer/bihar-gfr-2026.json";
import regional from "@/data/fertilizer/regional-packages.json";
import { fertilizerCropKey } from "./fertilizer-crop-registry";
import { soilLocationsMatch } from "./soil-health-links";
export type ScientificDose = {
  id: string;
  cropKey: string;
  state: string;
  district: string | null;
  zone: string | null;
  season: string | null;
  productionType: string;
  irrigationCondition: string | null;
  sowingCondition: string | null;
  excludedDistricts?: string[];
  requiresProductionConfirmation?: boolean;
  doseScope?: string;
  nutrientsKgHa: { n: number; p2o5: number; k2o: number };
  originalBasis: string;
  recommendationUnits: string;
  sourceId: string;
  sourcePage: number | null;
  sourceRow: string | number | null;
  conditions: string;
  phosphorusProduct: "DAP" | "SSP";
  verificationStatus: string;
  datasetVersion: string;
  applicationTiming: Array<{
    label: string;
    nFraction: number;
    pFraction: number;
    kFraction: number;
  }>;
};
export const fertilizerDatasetVersion = regional.version;
export const scientificDoses: ScientificDose[] = [
  ...(gfr.records as unknown as ScientificDose[]),
  ...(regional.records as unknown as ScientificDose[]),
];
export const doseSources = [gfr.source, ...regional.sources];
export function isExecutableScientificDose(record: ScientificDose) {
  return (
    [
      "VERIFIED_STANDARD_GENERAL_DISTRICT",
      "VERIFIED_STANDARD_REGIONAL",
    ].includes(record.verificationStatus) &&
    record.originalBasis === "N:P2O5:K2O" &&
    record.recommendationUnits === "kg/ha" &&
    !!doseSources.find((s) => s.id === record.sourceId) &&
    Object.values(record.nutrientsKgHa).every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  );
}
export function matchesDoseDistrict(record: ScientificDose, district: string) {
  if (
    record.district &&
    !soilLocationsMatch(
      { state: record.state, district: record.district },
      { state: record.state, district },
    )
  )
    return false;
  if (
    !("excludedDistricts" in record) ||
    !Array.isArray(record.excludedDistricts)
  )
    return true;
  return (
    !!district.trim() &&
    !record.excludedDistricts.some((name) =>
      soilLocationsMatch(
        { state: record.state, district: name },
        { state: record.state, district },
      ),
    )
  );
}
export function requiresProductionConfirmation(record: ScientificDose) {
  return (
    "requiresProductionConfirmation" in record &&
    record.requiresProductionConfirmation === true
  );
}
export function matchScientificDoses(
  crop: string,
  state: string,
  district: string,
  season?: string,
  conditions: {
    irrigationCondition?: string;
    sowingCondition?: string;
    productionType?: string;
    confirmedRecipeId?: string;
    includeConfirmationOptions?: boolean;
  } = {},
) {
  return scientificDoses.filter(
    (r) =>
      isExecutableScientificDose(r) &&
      (!requiresProductionConfirmation(r) ||
        conditions.includeConfirmationOptions ||
        conditions.confirmedRecipeId === r.id) &&
      r.cropKey === fertilizerCropKey(crop) &&
      r.state === state &&
      matchesDoseDistrict(r, district) &&
      (!r.season || r.season === season) &&
      (!r.irrigationCondition ||
        !conditions.irrigationCondition ||
        conditions.irrigationCondition === "UNKNOWN" ||
        r.irrigationCondition === conditions.irrigationCondition) &&
      (!r.sowingCondition ||
        !conditions.sowingCondition ||
        conditions.sowingCondition === "UNKNOWN" ||
        r.sowingCondition === conditions.sowingCondition) &&
      (!conditions.productionType ||
        r.productionType === conditions.productionType),
  );
}
export function registryRecipe(record: ScientificDose) {
  if (!isExecutableScientificDose(record))
    throw new Error(
      "This scientific dose is not source-verified with explicit compatible nutrient units and bases.",
    );
  const source = doseSources.find((s) => s.id === record.sourceId)!;
  return {
    id: record.id,
    cropAliases: [record.cropKey],
    states: [record.state],
    ...(record.district ? { districts: [record.district] } : {}),
    variant: `${record.cropKey} — ${record.state}${record.district ? `, ${record.district}` : ""} · ${record.productionType}${record.irrigationCondition ? ` · ${record.irrigationCondition}` : ""}`,
    conditions: record.conditions,
    nutrientsKgHa: record.nutrientsKgHa,
    phosphorusProduct: record.phosphorusProduct as "DAP" | "SSP",
    schedule: record.applicationTiming.map((t) => ({
      label: t.label,
      nFraction: t.nFraction,
      pFraction: t.pFraction,
      kFraction: t.kFraction,
    })),
    source: { title: source.title, url: source.url },
    scientificRecord: record,
    publicationDate: source.publicationDate,
    verificationStatus: record.verificationStatus,
    datasetVersion: record.datasetVersion,
  };
}
