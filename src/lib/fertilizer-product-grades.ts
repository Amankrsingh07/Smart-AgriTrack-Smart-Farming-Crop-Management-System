/** Reviewed specifications only. Farmer catalog entries do not acquire verification from a name. */
export const verifiedFertilizerProducts = {
  Urea: { n: 0.46, p2o5: 0, k2o: 0 },
  DAP: { n: 0.18, p2o5: 0.46, k2o: 0 },
  MOP: { n: 0, p2o5: 0, k2o: 0.6 },
  SSP: { n: 0, p2o5: 0.16, k2o: 0 },
};
export const fertilizerGradeSource = {
  id: "GOI-AGCENSUS-SSP16-AND-FAO-STANDARD-GRADES",
  url: "https://agcensus.gov.in/AgriCensus/media/UM_III_English.pdf",
  reviewedOn: "2026-11-15",
  note: "SSP available P2O5 16% minimum; use the actual verified label grade. Catalog names or farmer-entered compositions alone do not establish scientific verification.",
};

export const phosphorusGrades = {
  DAP: { ...verifiedFertilizerProducts.DAP, s: 0 },
  SSP: { ...verifiedFertilizerProducts.SSP, s: 0.11 },
  "NPK 10:26:26": { n: 0.1, p2o5: 0.26, k2o: 0.26, s: 0 },
  "NPK 12:32:16": { n: 0.12, p2o5: 0.32, k2o: 0.16, s: 0 },
  "NPS 20:20:0:13": { n: 0.2, p2o5: 0.2, k2o: 0, s: 0.13 },
} as const;

export type PhosphorusGrade = keyof typeof phosphorusGrades;

export const phosphorusGradeSources = {
  DAP: "https://www.iffco.in/en/dap-18-46-0",
  SSP: "https://fert.gov.in/sites/default/files/2025-04/Annual_Report_fertilizer_English.pdf",
  "NPK 10:26:26":
    "https://www.pib.gov.in/pressreleasepage.aspx?lang=2&prid=1763812",
  "NPK 12:32:16":
    "https://www.pib.gov.in/pressreleasepage.aspx?lang=2&prid=1763812",
  "NPS 20:20:0:13": "https://www.coromandel.biz/gromor-20-20-0-13/",
} satisfies Record<PhosphorusGrade, string>;
