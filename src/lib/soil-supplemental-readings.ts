export const supplementalSoilAnalytes = ["EC", "S", "Zn", "B", "Fe", "Mn", "Cu"] as const;
export type SupplementalSoilAnalyte = typeof supplementalSoilAnalytes[number];

export const supplementalSoilLabels: Record<SupplementalSoilAnalyte, string> = {
  EC: "Electrical conductivity", S: "Sulphur", Zn: "Zinc", B: "Boron",
  Fe: "Iron", Mn: "Manganese", Cu: "Copper",
};

export type SupplementalSoilReading = {
  analyte: SupplementalSoilAnalyte;
  value: number;
  unit: string;
  method: string;
  basis: string;
};
