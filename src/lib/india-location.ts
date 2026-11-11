import locations from "@/data/india-locations.json";
import districtAliasData from "@/data/india-district-aliases.json";

const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const stateAliases: Record<string, string> = {
  orissa: "odisha",
  uttaranchal: "uttarakhand",
  pondicherry: "puducherry",
  nctofdelhi: "delhi",
  jammukashmir: "jammuandkashmir",
};

const stateKey = (value: string) => {
  const name = normalize(value);
  return stateAliases[name] ?? name;
};

export function findIndianState(name: string) {
  const key = stateKey(name);
  return locations.states.find(state => stateKey(state.name) === key);
}

export function findIndianDistrict(stateCode: string, name: string) {
  const rawKey = normalize(name);
  const alias = districtAliasData.find(item => item.stateCode === stateCode && item.aliases.some(value => normalize(value) === rawKey));
  const key = normalize(alias?.canonicalDistrict ?? name);
  return locations.districts.find(district => district.stateCode === stateCode && normalize(district.name) === key);
}

export function indianStateNamesMatch(candidate: string, expected: string) {
  return stateKey(candidate) === stateKey(expected);
}
