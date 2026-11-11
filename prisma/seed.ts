import { PrismaClient, type Season, type WaterDataStatus, type WaterLevel, type WaterMeasure } from "@prisma/client";
import statesData from "./data/states.json";
import districtsData from "./data/districts.json";
import cropsData from "./data/crops.json";
import seasonsData from "./data/crop-seasons.json";
import soilsData from "./data/crop-soils.json";
import climateData from "./data/crop-climate.json";
import waterStagesData from "./data/crop-water-stages.json";
import cropLocationData from "./data/crop-location-suitabilities.json";

const prisma = new PrismaClient();
const meta = statesData.meta;
const UT_CODES = new Set(["1", "4", "7", "31", "34", "35", "37", "38"]);

type WaterStageSeedRow = {
  cropName: string;
  season: Season;
  stageName: string;
  startDay?: number;
  endDay?: number;
  cropCoefficient?: number;
  rootDepthMeters?: number;
  allowableDepletionFraction?: number;
  publicationDate?: string;
  publicationTitle?: string;
  publicationYear?: number;
  tableReference?: string;
  verifiedAt?: string;
  isFullSeasonTotal?: boolean;
  waterMeasure: WaterMeasure;
  waterRequirementMm?: number;
  minimumWaterRequirementMm?: number;
  maximumWaterRequirementMm?: number;
  source: string;
  sourceUrl: string;
  notes?: string;
  dataStatus?: WaterDataStatus;
  geographicScope?: string;
  irrigationMethod?: string;
  supportingSource?: string;
  supportingSourceUrl?: string;
};

type CropSeedRow = { name: string; seasons: Season[]; soilTypes: string[]; waterNeed: WaterLevel; description?: string; source: string; sourceUrl: string; illustrative?: boolean };
type CropSeasonSeedRow = { cropName: string; season: Season; source: string; sourceUrl: string; notes?: string };
type CropSoilSeedRow = { cropName: string; soilType: string; minPh?: number; maxPh?: number; minNitrogenKgHa?: number; maxNitrogenKgHa?: number; minPhosphorusKgHa?: number; maxPhosphorusKgHa?: number; minPotassiumKgHa?: number; maxPotassiumKgHa?: number; minOrganicCarbonPercent?: number; maxOrganicCarbonPercent?: number; minSoilMoisturePercent?: number; maxSoilMoisturePercent?: number; fertilizerRecommendation?: string; source: string; sourceUrl: string; notes?: string };
type CropClimateSeedRow = { cropName: string; minTemperatureC?: number; maxTemperatureC?: number; minRainfallMm?: number; maxRainfallMm?: number; minHumidityPercent?: number; maxHumidityPercent?: number; cropDurationDays?: number; source: string; sourceUrl: string; notes?: string };
type CropLocationSeedRow = { cropName: string; stateLgdCode: string; districtLgdCode?: string; season: Season; notes?: string; source: string; sourceUrl: string };

async function main() {
  const states = uniqueByCode(statesData.records, "state");
  const districts = uniqueByCode(districtsData.records, "district");
  const stateCodes = new Set(states.map((state) => state.lgdCode));
  const validDistricts = districts.filter((district) => stateCodes.has(district.stateLgdCode));
  const rejectedDistricts = districts.length - validDistricts.length;
  let missingCoordinates = 0;

  for (const row of states) {
    await prisma.state.upsert({
      where: { lgdCode: row.lgdCode },
      update: { name: row.name, isUnionTerritory: UT_CODES.has(row.lgdCode), isActive: true, source: meta.source, sourceDate: new Date(meta.sourceDate) },
      create: { lgdCode: row.lgdCode, name: row.name, isUnionTerritory: UT_CODES.has(row.lgdCode), isActive: true, source: meta.source, sourceDate: new Date(meta.sourceDate) },
    });
  }

  const statesByCode = new Map((await prisma.state.findMany({ select: { id: true, lgdCode: true } })).map((state) => [state.lgdCode, state.id]));
  const existingDistricts = await prisma.district.findMany({ where: { lgdCode: { in: validDistricts.map((district) => district.lgdCode) } }, select: { lgdCode: true, latitude: true, longitude: true } });
  const existingByCode = new Map(existingDistricts.map((district) => [district.lgdCode, district]));
  const districtUpserts = [];
  for (const row of validDistricts) {
    const stateId = statesByCode.get(row.stateLgdCode);
    if (!stateId) { throw new Error(`District ${row.lgdCode} references missing state ${row.stateLgdCode}`); }
    const existing = existingByCode.get(row.lgdCode);
    const latitude = validCoordinate(row.latitude, -90, 90);
    const longitude = validCoordinate(row.longitude, -180, 180);
    if (latitude === null || longitude === null) missingCoordinates++;
    const update = {
        name: row.name, stateId, isActive: true, source: meta.source,
        sourceDate: new Date(meta.sourceDate),
        ...(latitude !== null ? { latitude } : existing?.latitude !== null && existing?.latitude !== undefined ? { latitude: existing.latitude } : {}),
        ...(longitude !== null ? { longitude } : existing?.longitude !== null && existing?.longitude !== undefined ? { longitude: existing.longitude } : {}),
    };
    districtUpserts.push(prisma.district.upsert({
      where: { lgdCode: row.lgdCode }, update,
      create: { lgdCode: row.lgdCode, name: row.name, stateId, isActive: true, source: meta.source, sourceDate: new Date(meta.sourceDate), latitude, longitude },
    }).catch(async (error: unknown) => {
      // Concurrent repeated seed invocations can race on MySQL's upsert emulation.
      if (isUniqueConstraintError(error)) return prisma.district.update({ where: { lgdCode: row.lgdCode }, data: update });
      throw error;
    }));
    if (districtUpserts.length === 20) await Promise.all(districtUpserts.splice(0));
  }
  await Promise.all(districtUpserts);

  const cropProfileReport = await seedCropProfiles(cropsData as CropSeedRow[], seasonsData as CropSeasonSeedRow[], soilsData as CropSoilSeedRow[], climateData as CropClimateSeedRow[], cropLocationData as CropLocationSeedRow[]);
  const waterProfileReport = await seedWaterStageProfiles(waterStagesData as WaterStageSeedRow[]);

  // The structured crop files are intentionally empty until verified source values are supplied.
  // Never turn an unverified crop suitability or water value into a database record.
  const report = {
    source: meta.source, sourceUrl: meta.sourceUrl, sourceDate: meta.sourceDate, importedAt: meta.importedAt,
    statesUpserted: states.length,
    unionTerritoriesUpserted: states.filter((state) => UT_CODES.has(state.lgdCode)).length,
    districtsUpserted: validDistricts.length,
    missingCoordinateRecords: missingCoordinates,
    invalidOrRejectedDistricts: rejectedDistricts,
    cropProfiles: cropProfileReport,
    waterStageProfilesUpserted: waterProfileReport.upserted,
    waterStageProfilesSkipped: waterProfileReport.skipped,
    waterStageProfilesRejected: waterProfileReport.rejected,
    sourceBackedProfilesProcessed: cropProfileReport.cropsUpserted + cropProfileReport.seasonsUpserted + cropProfileReport.soilRequirementsUpserted + cropProfileReport.climateRequirementsUpserted + cropProfileReport.locationProfilesUpserted + waterProfileReport.upserted,
    sourceBackedProfilesRejectedOrSkipped: cropProfileReport.rowsRejected + cropProfileReport.rowsSkipped + waterProfileReport.rejected + waterProfileReport.skipped,
  };
  console.log(`AgriTrack seed report\n${JSON.stringify(report, null, 2)}`);
}

async function seedCropProfiles(cropRows: CropSeedRow[], seasonRows: CropSeasonSeedRow[], soilRows: CropSoilSeedRow[], climateRows: CropClimateSeedRow[], locationRows: CropLocationSeedRow[]) {
  let cropsUpserted = 0, seasonsUpserted = 0, soilsUpserted = 0, climatesUpserted = 0, locationsUpserted = 0, rowsSkipped = 0, rowsRejected = 0;
  const cropNames = new Set<string>();
  for (const row of cropRows) {
    const sourceUrl = validSourceUrl(row.sourceUrl);
    if (!row.name?.trim() || cropNames.has(row.name.toLowerCase()) || !sourceUrl || !row.source?.trim() || !Array.isArray(row.seasons) || !Array.isArray(row.soilTypes) || !["LOW", "MEDIUM", "HIGH"].includes(row.waterNeed)) { rowsRejected++; continue; }
    cropNames.add(row.name.toLowerCase());
    const cropValues = { seasons: row.seasons.join(","), soilTypes: row.soilTypes.join(","), waterNeed: row.waterNeed, description: row.description, source: row.source, sourceUrl: sourceUrl.toString(), illustrative: row.illustrative ?? false };
    const existing = await prisma.crop.findUnique({ where: { name: row.name.trim() }, select: { id: true, sourceUrl: true, illustrative: true } });
    if (!existing) await prisma.crop.create({ data: { name: row.name.trim(), ...cropValues } });
    else if (!existing.sourceUrl || existing.illustrative) await prisma.crop.update({ where: { id: existing.id }, data: cropValues });
    cropsUpserted++;
  }
  const seasonsByKey = new Set<string>();
  for (const row of seasonRows) {
    const key = `${row.cropName}|${row.season}`;
    const sourceUrl = validSourceUrl(row.sourceUrl);
    if (seasonsByKey.has(key) || !row.source?.trim() || !sourceUrl) { rowsRejected++; continue; }
    seasonsByKey.add(key);
    const crop = await prisma.crop.findUnique({ where: { name: row.cropName }, select: { id: true } });
    if (!crop) { rowsSkipped++; continue; }
    const existing = await prisma.cropSeason.findUnique({ where: { cropId_season: { cropId: crop.id, season: row.season } }, select: { id: true, sourceUrl: true } });
    if (!existing) await prisma.cropSeason.create({ data: { cropId: crop.id, season: row.season, source: row.source, sourceUrl: sourceUrl.toString() } });
    else if (!existing.sourceUrl) await prisma.cropSeason.update({ where: { id: existing.id }, data: { source: row.source, sourceUrl: sourceUrl.toString() } });
    seasonsUpserted++;
  }
  const soilKeys = new Set<string>();
  for (const row of soilRows) {
    const key = `${row.cropName}|${row.soilType.toLowerCase()}`;
    const sourceUrl = validSourceUrl(row.sourceUrl);
    if (soilKeys.has(key) || !row.cropName?.trim() || !row.soilType?.trim() || !row.source?.trim() || !sourceUrl || !validRanges(row)) { rowsRejected++; continue; }
    soilKeys.add(key);
    const crop = await prisma.crop.findUnique({ where: { name: row.cropName }, select: { id: true } });
    if (!crop) { rowsSkipped++; continue; }
    const soilValues = {
      soilType: row.soilType, minPh: row.minPh, maxPh: row.maxPh,
      minNitrogenKgHa: row.minNitrogenKgHa, maxNitrogenKgHa: row.maxNitrogenKgHa,
      minPhosphorusKgHa: row.minPhosphorusKgHa, maxPhosphorusKgHa: row.maxPhosphorusKgHa,
      minPotassiumKgHa: row.minPotassiumKgHa, maxPotassiumKgHa: row.maxPotassiumKgHa,
      minOrganicCarbonPercent: row.minOrganicCarbonPercent, maxOrganicCarbonPercent: row.maxOrganicCarbonPercent,
      minSoilMoisturePercent: row.minSoilMoisturePercent, maxSoilMoisturePercent: row.maxSoilMoisturePercent,
      fertilizerRecommendation: row.fertilizerRecommendation, source: row.source, sourceUrl: sourceUrl.toString(), notes: row.notes,
    };
    const existing = await prisma.cropSoilRequirement.findUnique({ where: { cropId_soilType: { cropId: crop.id, soilType: row.soilType } }, select: { id: true, sourceUrl: true } });
    if (!existing) await prisma.cropSoilRequirement.create({ data: { ...soilValues, cropId: crop.id } });
    else if (!existing.sourceUrl) await prisma.cropSoilRequirement.update({ where: { id: existing.id }, data: soilValues });
    soilsUpserted++;
  }
  const climateKeys = new Set<string>();
  for (const row of climateRows) {
    const sourceUrl = validSourceUrl(row.sourceUrl);
    if (climateKeys.has(row.cropName) || !row.cropName?.trim() || !row.source?.trim() || !sourceUrl || !validRanges(row)) { rowsRejected++; continue; }
    climateKeys.add(row.cropName);
    const crop = await prisma.crop.findUnique({ where: { name: row.cropName }, select: { id: true } });
    if (!crop) { rowsSkipped++; continue; }
    const climateValues = {
      minTemperatureC: row.minTemperatureC, maxTemperatureC: row.maxTemperatureC,
      minRainfallMm: row.minRainfallMm, maxRainfallMm: row.maxRainfallMm,
      minHumidityPercent: row.minHumidityPercent, maxHumidityPercent: row.maxHumidityPercent,
      cropDurationDays: row.cropDurationDays, source: row.source, sourceUrl: sourceUrl.toString(), notes: row.notes,
    };
    const existing = await prisma.cropClimateRequirement.findUnique({ where: { cropId: crop.id }, select: { id: true, sourceUrl: true } });
    if (!existing) await prisma.cropClimateRequirement.create({ data: { ...climateValues, cropId: crop.id } });
    else if (!existing.sourceUrl) await prisma.cropClimateRequirement.update({ where: { id: existing.id }, data: climateValues });
    climatesUpserted++;
  }
  const locationKeys = new Set<string>();
  for (const row of locationRows) {
    const key = `${row.cropName}|${row.stateLgdCode}|${row.districtLgdCode ?? ""}|${row.season}`;
    const sourceUrl = validSourceUrl(row.sourceUrl);
    if (locationKeys.has(key) || !row.cropName?.trim() || !row.stateLgdCode?.trim() || !row.source?.trim() || !sourceUrl) { rowsRejected++; continue; }
    locationKeys.add(key);
    const [crop, state] = await Promise.all([
      prisma.crop.findUnique({ where: { name: row.cropName }, select: { id: true } }),
      prisma.state.findUnique({ where: { lgdCode: row.stateLgdCode }, select: { name: true } }),
    ]);
    if (!crop || !state) { rowsSkipped++; continue; }
    const season = await prisma.cropSeason.upsert({ where: { cropId_season: { cropId: crop.id, season: row.season } }, update: {}, create: { cropId: crop.id, season: row.season, source: row.source, sourceUrl: sourceUrl.toString() }, select: { id: true } });
    if (row.districtLgdCode) {
      const district = await prisma.district.findUnique({ where: { lgdCode: row.districtLgdCode }, select: { id: true, state: { select: { lgdCode: true } } } });
      if (!district || district.state.lgdCode !== row.stateLgdCode) { rowsSkipped++; continue; }
      const existing = await prisma.cropDistrictSuitability.findFirst({ where: { cropId: crop.id, districtId: district.id, cropSeasonId: season.id }, select: { id: true, sourceUrl: true } });
      if (!existing) await prisma.cropDistrictSuitability.create({ data: { cropId: crop.id, districtId: district.id, cropSeasonId: season.id, notes: row.notes, source: row.source, sourceUrl: sourceUrl.toString() } });
      else if (!existing.sourceUrl) await prisma.cropDistrictSuitability.update({ where: { id: existing.id }, data: { notes: row.notes, source: row.source, sourceUrl: sourceUrl.toString() } });
    } else {
      const existing = await prisma.cropLocationSuitability.findFirst({ where: { cropId: crop.id, state: state.name, district: null, season: row.season }, select: { id: true, sourceUrl: true } });
      if (!existing) await prisma.cropLocationSuitability.create({ data: { cropId: crop.id, state: state.name, season: row.season, notes: row.notes, source: row.source, sourceUrl: sourceUrl.toString() } });
      else if (!existing.sourceUrl) await prisma.cropLocationSuitability.update({ where: { id: existing.id }, data: { notes: row.notes, source: row.source, sourceUrl: sourceUrl.toString() } });
    }
    locationsUpserted++;
  }
  return { cropsUpserted, seasonsUpserted, soilRequirementsUpserted: soilsUpserted, climateRequirementsUpserted: climatesUpserted, locationProfilesUpserted: locationsUpserted, rowsSkipped, rowsRejected };
}

async function seedWaterStageProfiles(rows: WaterStageSeedRow[]) {
  const seen = new Set<string>();
  let upserted = 0;
  let skipped = 0;
  let rejected = 0;
  for (const row of rows) {
    const key = [row.cropName, row.season, row.stageName, row.waterMeasure].join("|");
    if (seen.has(key)) { rejected++; continue; }
    seen.add(key);
    const hasExact = typeof row.waterRequirementMm === "number" && Number.isFinite(row.waterRequirementMm) && row.waterRequirementMm >= 0;
    const hasRange = typeof row.minimumWaterRequirementMm === "number" && Number.isFinite(row.minimumWaterRequirementMm) && row.minimumWaterRequirementMm >= 0
      && typeof row.maximumWaterRequirementMm === "number" && Number.isFinite(row.maximumWaterRequirementMm) && row.maximumWaterRequirementMm >= row.minimumWaterRequirementMm;
    const hasCoefficient = typeof row.cropCoefficient === "number" && Number.isFinite(row.cropCoefficient) && row.cropCoefficient >= 0;
    let sourceUrl: URL | undefined;
    try { sourceUrl = new URL(row.sourceUrl); } catch { sourceUrl = undefined; }
    if (!row.cropName?.trim() || !row.stageName?.trim() || !row.source?.trim() || !sourceUrl || sourceUrl.protocol !== "https:" || (hasExact === hasRange && !hasCoefficient)) {
      rejected++;
      continue;
    }
    const crop = await prisma.crop.findUnique({ where: { name: row.cropName }, select: { id: true } });
    if (!crop) { skipped++; continue; }
    const cropSeason = await prisma.cropSeason.upsert({
      where: { cropId_season: { cropId: crop.id, season: row.season } },
      update: {},
      create: { cropId: crop.id, season: row.season },
      select: { id: true },
    });
    const stageValues = {
      stageName: row.stageName, startDay: row.startDay, endDay: row.endDay,
      cropCoefficient: row.cropCoefficient, rootDepthMeters: row.rootDepthMeters,
      allowableDepletionFraction: row.allowableDepletionFraction,
      publicationDate: row.publicationDate ? new Date(`${row.publicationDate}T00:00:00.000Z`) : undefined,
      publicationTitle: row.publicationTitle,
      publicationYear: row.publicationYear,
      tableReference: row.tableReference,
      verifiedAt: row.verifiedAt ? new Date(`${row.verifiedAt}T00:00:00.000Z`) : undefined,
      isFullSeasonTotal: row.isFullSeasonTotal ?? false, waterMeasure: row.waterMeasure,
      waterRequirementMm: hasExact ? row.waterRequirementMm : null,
      minimumWaterRequirementMm: hasRange ? row.minimumWaterRequirementMm : null,
      maximumWaterRequirementMm: hasRange ? row.maximumWaterRequirementMm : null,
      source: row.source, sourceUrl: sourceUrl.toString(), notes: row.notes,
      // Missing provenance status is never promoted to verified by the seed.
      dataStatus: row.dataStatus ?? "ESTIMATED", geographicScope: row.geographicScope ?? null,
      irrigationMethod: row.irrigationMethod ?? null,
      supportingSource: row.supportingSource ?? null, supportingSourceUrl: row.supportingSourceUrl ?? null,
    };
    const existing = await prisma.cropWaterStage.findUnique({ where: { cropId_cropSeasonId_stageName_waterMeasure: { cropId: crop.id, cropSeasonId: cropSeason.id, stageName: row.stageName, waterMeasure: row.waterMeasure } }, select: { id: true, sourceUrl: true } });
    if (!existing) await prisma.cropWaterStage.create({ data: { ...stageValues, cropId: crop.id, cropSeasonId: cropSeason.id } });
    // Keep sourced records intact unless they match this canonical source row. For
    // matching rows, refresh provenance/method/status metadata and corrected values idempotently.
    else if (!existing.sourceUrl || existing.sourceUrl === stageValues.sourceUrl) {
      await prisma.cropWaterStage.update({ where: { id: existing.id }, data: stageValues });
    }
    upserted++;
  }
  return { upserted, skipped, rejected };
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function uniqueByCode<T extends { lgdCode: string }>(rows: T[], label: string): T[] {
  const seen = new Set<string>();
  const valid: T[] = [];
  for (const row of rows) {
    if (!row.lgdCode?.trim() || seen.has(row.lgdCode)) throw new Error(`Invalid or duplicate ${label} LGD code: ${row.lgdCode}`);
    seen.add(row.lgdCode);
    valid.push(row);
  }
  return valid;
}

function validCoordinate(value: number | null, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function validSourceUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" ? url : undefined; } catch { return undefined; }
}

function validRanges(row: Record<string, unknown>) {
  for (const [minimumKey, maximumKey] of [["minPh", "maxPh"], ["minNitrogenKgHa", "maxNitrogenKgHa"], ["minPhosphorusKgHa", "maxPhosphorusKgHa"], ["minPotassiumKgHa", "maxPotassiumKgHa"], ["minOrganicCarbonPercent", "maxOrganicCarbonPercent"], ["minSoilMoisturePercent", "maxSoilMoisturePercent"], ["minTemperatureC", "maxTemperatureC"], ["minRainfallMm", "maxRainfallMm"], ["minHumidityPercent", "maxHumidityPercent"]]) {
    const minimum = row[minimumKey], maximum = row[maximumKey];
    if (minimum !== undefined && (typeof minimum !== "number" || !Number.isFinite(minimum))) return false;
    if (maximum !== undefined && (typeof maximum !== "number" || !Number.isFinite(maximum))) return false;
    if (typeof minimum === "number" && typeof maximum === "number" && minimum > maximum) return false;
    const bounds: Record<string, [number, number]> = {
      minPh: [0, 14], maxPh: [0, 14], minNitrogenKgHa: [0, 10000], maxNitrogenKgHa: [0, 10000],
      minPhosphorusKgHa: [0, 10000], maxPhosphorusKgHa: [0, 10000], minPotassiumKgHa: [0, 10000], maxPotassiumKgHa: [0, 10000],
      minOrganicCarbonPercent: [0, 20], maxOrganicCarbonPercent: [0, 20], minSoilMoisturePercent: [0, 100], maxSoilMoisturePercent: [0, 100],
      minTemperatureC: [-20, 60], maxTemperatureC: [-20, 60], minRainfallMm: [0, 10000], maxRainfallMm: [0, 10000],
      minHumidityPercent: [0, 100], maxHumidityPercent: [0, 100],
    };
    const bound = bounds[minimumKey];
    if (bound && typeof minimum === "number" && (minimum < bound[0] || minimum > bound[1])) return false;
    const maximumBound = bounds[maximumKey];
    if (maximumBound && typeof maximum === "number" && (maximum < maximumBound[0] || maximum > maximumBound[1])) return false;
  }
  return true;
}

main().catch((error) => { console.error("AgriTrack seed failed:", error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
