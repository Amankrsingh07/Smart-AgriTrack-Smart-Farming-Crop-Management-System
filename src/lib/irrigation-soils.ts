import soilReference from "@/data/irrigation/soil_reference.json";

export const irrigationSoils = soilReference.soils.map(({ soil }) => soil);

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, " ");

const savedSoilAliases = new Map([
  ["sand", "Sandy Soil"],
  ["sandy", "Sandy Soil"],
  ["loam", "Loamy Soil"],
  ["loamy", "Loamy Soil"],
  ["clay", "Clay Soil"],
  ["clayey", "Clay Soil"],
  ["silty loam", "Silt Loam"],
  ["silt clay loam", "Silty Clay Loam"],
]);

export function matchIrrigationSoil(value?: string | null): string {
  const key = normalize(value ?? "").replace(/ soil$/, "");
  return (
    irrigationSoils.find(
      (soil) => normalize(soil).replace(/ soil$/, "") === key,
    ) ??
    savedSoilAliases.get(key) ??
    "Other"
  );
}
