// Numeric facts and authored applicability summaries. Source publications stay with their publishers.
export const storageReferenceVersion = "2026-11-26.1";
export const storageSources = {
  odisha: "https://www.foododisha.in/Download/SCMSReport18012018.pdf",
  village: "https://www.fao.org/4/i2467e/i2467e00.pdf",
  india: "https://www.fao.org/4/x5002e/X5002e02.htm",
  irri: "https://www2.hcmuaf.edu.vn/data/dangnh/file/paddy%20posharvest_IRRI.pdf",
  icarStorageSop:
    "https://dfpd.gov.in/WriteReadData/CircularManagement/ef9775d0-9b19-432c-85d4-aef5a54d658c_SOP%20Storage%20dated%2003.01.2022_31.10.2022.pdf",
  fci: "https://fci.gov.in/fci-storage/storage/app/uploads/662297b721c361713543095.pdf",
  annual: "https://www.fao.org/4/v5380e/v5380e06.htm",
  paddy:
    "https://www.fao.org/fileadmin/user_upload/inpho/docs/Post_Harvest_Compendium_-_RICE.pdf",
  hotRegions: "https://www.fao.org/4/t0522e/T0522E09.htm",
  selectedLegumes: "https://www.fao.org/4/w0078e/w0078e07.htm",
  codex:
    "https://www.fao.org/fao-who-codexalimentarius/sh-proxy/en/?lnk=1&url=https%3A%2F%2Fworkspace.fao.org%2Fsites%2Fcodex%2FStandards%2FCXC+51-2003%2FCXC_051e.pdf",
};
export type StorageReference = {
  moisture: number;
  temperature: number | null;
  humidity: number | null;
  duration: string;
  source: string;
  strictMaximum: boolean;
  minDays?: number;
  maxDays?: number;
};

const annual = {
  temperature: 27,
  humidity: 70,
  duration: "Up to one year at 27°C and 70% RH",
  maxDays: 365,
  source: storageSources.annual,
  strictMaximum: false,
};
const unconditioned = {
  temperature: null,
  humidity: null,
  strictMaximum: false,
};
export const grainStorageReferences: Record<string, StorageReference> = {
  wheat: { ...annual, moisture: 13.5 },
  maize: { ...annual, moisture: 13.5 },
  sorghum: { ...annual, moisture: 13.5 },
  millet: { ...annual, moisture: 16 },
  "milled rice": { ...annual, moisture: 13 },
  paddy: {
    ...unconditioned,
    moisture: 12,
    duration: "More than six months",
    minDays: 181,
    source: storageSources.paddy,
    strictMaximum: true,
  },
  mustard: {
    ...unconditioned,
    moisture: 6,
    duration: "Reference duration unavailable",
    source: storageSources.india,
  },
  barley: {
    ...unconditioned,
    moisture: 12,
    duration: "More than six months",
    minDays: 181,
    source: storageSources.village,
  },
  "shelled groundnut": {
    ...unconditioned,
    moisture: 7,
    duration: "Long-term storage in hot regions",
    source: storageSources.hotRegions,
  },
  "unshelled groundnut": {
    ...unconditioned,
    moisture: 9,
    duration: "Reference duration unavailable",
    source: storageSources.selectedLegumes,
  },
  soybean: {
    ...unconditioned,
    moisture: 11,
    duration: "Reference duration unavailable",
    source: storageSources.selectedLegumes,
  },
  "pigeon pea": {
    ...unconditioned,
    moisture: 14,
    duration: "Reference duration unavailable",
    source: storageSources.selectedLegumes,
  },
};

export const shortStorageReferences: Record<string, StorageReference> = {
  paddy: {
    ...unconditioned,
    moisture: 14,
    duration: "Up to two months; clean paddy",
    maxDays: 60,
    source: storageSources.odisha,
  },
  barley: {
    ...unconditioned,
    moisture: 14,
    duration: "Less than six months",
    maxDays: 179,
    source: storageSources.village,
  },
};

export const irriIntermediatePaddy: StorageReference = {
  ...unconditioned,
  moisture: 13,
  minDays: 61,
  maxDays: 90,
  duration:
    "61–90 days; conservative end of IRRI’s 13–14% range, under suitable conditions",
  source: storageSources.irri,
};
