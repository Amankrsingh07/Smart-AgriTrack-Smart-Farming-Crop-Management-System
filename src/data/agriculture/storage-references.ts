// Numeric facts and authored applicability summaries. Source publications stay with their publishers.
export const storageReferenceVersion = "2026-11-18.2";
export const storageSources = {
 annual:"https://www.fao.org/4/v5380e/v5380e06.htm",
 paddy:"https://www.fao.org/fileadmin/user_upload/inpho/docs/Post_Harvest_Compendium_-_RICE.pdf",
 hotRegions:"https://www.fao.org/4/t0522e/T0522E09.htm",
 selectedLegumes:"https://www.fao.org/4/w0078e/w0078e07.htm",
 codex:"https://www.fao.org/fao-who-codexalimentarius/sh-proxy/en/?lnk=1&url=https%3A%2F%2Fworkspace.fao.org%2Fsites%2Fcodex%2FStandards%2FCXC+51-2003%2FCXC_051e.pdf",
};
const annual={temperature:27,humidity:70,duration:"One year",source:storageSources.annual,strictMaximum:false};
const unconditioned={temperature:null,humidity:null,strictMaximum:false};
export const grainStorageReferences = {
 wheat:{...annual,moisture:13.5},
 maize:{...annual,moisture:13.5},
 sorghum:{...annual,moisture:13.5},
 millet:{...annual,moisture:16},
 "milled rice":{...annual,moisture:13},
 paddy:{...unconditioned,moisture:12,duration:"More than six months",source:storageSources.paddy,strictMaximum:true},
 "shelled groundnut":{...unconditioned,moisture:7,duration:"Long-term storage in hot regions",source:storageSources.hotRegions},
 "unshelled groundnut":{...unconditioned,moisture:9,duration:"Reference duration unavailable",source:storageSources.selectedLegumes},
 soybean:{...unconditioned,moisture:11,duration:"Reference duration unavailable",source:storageSources.selectedLegumes},
 "pigeon pea":{...unconditioned,moisture:14,duration:"Reference duration unavailable",source:storageSources.selectedLegumes},
};
