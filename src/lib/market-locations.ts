export function districtApiNames(district?: string) {
  const normalized = district?.trim().toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (normalized === "dehradun" || normalized === "dehradoon") {
    return ["Dehradun", "Dehradoon"];
  }
  if (["baragada", "bargarh", "baragarh"].includes(normalized)) {
    return ["Baragada", "Bargarh", "Baragarh"];
  }
  return district ? [district] : [""];
}
