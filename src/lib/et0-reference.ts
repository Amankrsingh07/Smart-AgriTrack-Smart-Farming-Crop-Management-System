import et0Reference from "@/data/irrigation/et0_reference.json";
import districtAliasData from "@/data/india-district-aliases.json";
import { findIndianDistrict, findIndianState } from "@/lib/india-location";

const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export function findOfflineEt0(stateName: string, districtName: string, month: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return undefined;
  const state = findIndianState(stateName);
  if (!state) return undefined;
  const district = findIndianDistrict(state.code, districtName);
  if (!district) return undefined;
  const record = et0Reference.records.find(row =>
    normalize(row.state) === normalize(state.name)
    && normalize(row.district) === normalize(district.name)
    && row.month === month,
  );
  if (!record) return undefined;
  return {
    record,
    state: state.name,
    district: district.name,
    aliasUsed: normalize(districtName) !== normalize(district.name),
    source: et0Reference.meta.source,
    sourceUrl: et0Reference.meta.sourceUrl,
    referencePeriod: et0Reference.meta.sourcePeriod,
    datasetVersion: et0Reference.meta.datasetVersion,
    verificationStatus: et0Reference.meta.verificationStatus,
    spatialMethod: et0Reference.meta.spatialMethod,
    units: et0Reference.meta.units,
    districtResolutionSourceUrl: districtAliasData.find(item => item.stateCode === state.code && item.aliases.some(alias => normalize(alias) === normalize(districtName)))?.sourceUrls[0],
  };
}

export const offlineEt0DatasetMeta = et0Reference.meta;
