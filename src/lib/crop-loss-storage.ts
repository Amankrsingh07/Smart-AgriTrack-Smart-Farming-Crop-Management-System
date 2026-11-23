import { z } from "zod";
import {grainStorageReferences,storageSources} from "../data/agriculture/storage-references";
export {storageReferenceVersion} from "../data/agriculture/storage-references";
import { indiaDateKey } from "./crop-cycle-status";

export const inspectionFindings = z.object({
 moisture: z.number().min(0).max(100).nullable(),
 temperature: z.number().min(-273.15).nullable(),
 humidity: z.number().min(0).max(100).nullable(),
 pests: z.enum(["Unknown", "Observed", "None observed"]),
 mold: z.enum(["Unknown", "Observed", "None observed"]),
 condition: z.enum(["Unknown", "Clean and dry", "Damp or damaged", "Good", "Moderate", "Poor"]),
 pestType: z.string().trim().min(1).max(120).optional(),
 severity: z.enum(["Unknown","Mild","Moderate","Severe"]).optional(),
 symptoms: z.string().trim().min(1).max(500).optional(),
 disease: z.enum(["Unknown","Observed","None observed"]).optional(),
 storageType: z.enum(["Unknown","Warehouse","Silo","Bags","Traditional storage"]).optional(),
 durationDays: z.number().int().min(0).max(36500).optional(),
 ventilation: z.enum(["Unknown","Good","Moderate","Poor"]).optional(),
 leakage: z.enum(["Unknown","Observed","None observed"]).optional(),
}).strict();

export const inspectionInput = z.object({
 productionId: z.string().min(1).max(191),
 version: z.number().int().min(0).max(2147483646),
 inspectedOn: z.iso.date().refine(date => date <= indiaDateKey(new Date()), "Use a real inspection date, on or before today."),
 findings: inspectionFindings,
}).strict().refine(({findings}) => Object.values(findings).some(value => value != null && value !== "Unknown"), {
 message: "Enter at least one measurement or observation.",
});

export type Inspection = z.infer<typeof inspectionFindings>;
export type SavedInspection = {version:number; inspectedOn:string; createdAt?:string; findings:Inspection;attachments?:{id:string;filename:string}[]};

export function storageReference(crop:string) {
 const name = crop.trim().toLowerCase();
 const aliases:Record<string,keyof typeof grainStorageReferences> = {"corn":"maize","makka":"maize","rice (paddy)":"paddy"};
 const key = Object.hasOwn(aliases,name) ? aliases[name] : name;
 // Ambiguous crop forms, such as rice and groundnut, need specific storage guidance.
 return Object.hasOwn(grainStorageReferences,key) ? grainStorageReferences[key as keyof typeof grainStorageReferences] : null;
}

export function cropPhReference(crop:string){
 const name=crop.trim().toLowerCase();
 const range=["rice","rice (paddy)","paddy"].includes(name)?[5.5,7.5]:
  ["wheat","maize","corn","makka"].includes(name)?[5.5,7]:null;
 return range?{range,version:"FAO Bulletin 16 · 2006",source:"https://www.fao.org/4/a0443e/a0443e02.pdf"}:null;
}

export const storageRiskOrder = ["No current concern","Insufficient data","Inspection required","Potential concern","High concern"] as const;
type Status = typeof storageRiskOrder[number];
export type RainDay = {date:string;rainMm:number|null;rainProbability:number|null};
export const emptyInspection:Inspection = {moisture:null,temperature:null,humidity:null,pests:"Unknown",mold:"Unknown",condition:"Unknown"};
export const storageActions = {
 inspection:"Inspect stored produce for insects or damage.",
 moisture:"Check grain moisture before storage and ask about testing suspected mold.",
 segregation:"Segregate affected grain. Hold it from food, feed and sale. Ask a grain safety specialist for representative sampling and crop-appropriate mycotoxin testing.",
 structure:"Repair leaks, keep grain clear of damp surfaces and ask a storage adviser to review ventilation.",
 climate:"Check for condensation and hot spots. Ask a storage adviser to review cooling and aeration.",
 rain:"Check the weather and have cover ready for exposed produce.",
} as const;

/** A published moisture limit is usable only when its crop and stated storage period fit this lot. */
export function storageMoistureGuideline(crop:string,durationDays:number|null|undefined) {
 const reference=storageReference(crop);
 if(!reference)return {available:false as const,reference:null,reason:"No crop-specific moisture guideline is available."};
 if(durationDays==null)return {available:false as const,reference,reason:"Record the planned storage duration to check whether this guideline applies."};
 const duration=reference.duration.toLowerCase();
 if(duration.includes("unavailable"))return {available:false as const,reference,reason:"The source does not state an applicable storage duration."};
 if(duration.includes("hot regions"))return {available:false as const,reference,reason:"The applicable hot-region and storage-duration scope is not verified for this lot."};
 if(duration.includes("more than six months")&&durationDays<=180)return {available:false as const,reference,reason:"This guideline is for storage longer than six months."};
 if(duration.includes("one year")&&durationDays>365)return {available:false as const,reference,reason:"This guideline is limited to storage up to one year."};
 return {available:true as const,reference,reason:"The crop and recorded storage duration match the published guideline scope."};
}

export function storageRisk(findings:Inspection,crop:string,forecast:readonly RainDay[] = []) {
 const reference = storageReference(crop);
 const card = (label:string,status:Status,note:string,action:string,value?:string,standard?:string,source?:string) =>
  ({label,status,note,action,value,standard,source});
 const {moisture,temperature,humidity,pests,mold,disease,symptoms,condition,ventilation,leakage,severity} = findings;
 const durationMatches=!!reference&&findings.durationDays!=null&&
  (!reference.duration.toLowerCase().includes("one year")||findings.durationDays<=365)&&
  !reference.duration.toLowerCase().includes("unavailable")&&!reference.duration.toLowerCase().includes("hot regions")&&
  (!reference.duration.toLowerCase().includes("more than six months")||findings.durationDays>180);
 const withinReference = "Recorded reading is within the published scenario benchmark.";
 const moistureGuideline=storageMoistureGuideline(crop,findings.durationDays);
 const moistureExceeded = moisture != null && moistureGuideline.available && (reference!.strictMaximum ? moisture >= reference!.moisture : moisture > reference!.moisture);
 const climateCard = (label:string,value:number|null,limit:number|null|undefined,unit:string) => card(label,
  value == null ? "Inspection required" : limit == null || !durationMatches ? "Inspection required" : value>limit ? "Potential concern" : "No current concern",
  value == null ? "Indoor reading not recorded. Measure inside the storage area." : limit != null && durationMatches&&value>limit ? "Above the source-backed storage reference for this recorded crop and duration." : limit != null&&durationMatches ? withinReference : "Guideline unavailable for the recorded crop and storage duration. Check conditions and ask a storage adviser.",
  storageActions.climate,value == null ? undefined : `${value} ${unit}`,limit == null||!durationMatches ? undefined : `${limit} ${unit} · ${reference?.duration}`,limit == null||!durationMatches ? undefined : reference?.source);
 const pestConflict=pests==="None observed"&&(!!findings.pestType||severity==="Moderate"||severity==="Severe");
 const pestRisk = pests==="Observed" ? severity==="Moderate"||severity==="Severe" ? "Potential concern" : "Inspection required" : pests==="None observed"&&!pestConflict ? "No current concern" : "Inspection required";
 const diseaseRisk = disease==="None observed"&&!symptoms ? "No current concern" : "Inspection required";
 const moldRisk=mold==="Observed"?"Potential concern":mold==="None observed"?"No current concern":"Inspection required";
 const poor = condition==="Poor" || condition==="Damp or damaged" || ventilation==="Poor";
 const moderate = condition==="Moderate" || ventilation==="Moderate";
 const rain = forecast.find(day=>(day.rainMm??0)>0 || (day.rainProbability??0)>0);
 const rainReading = rain??forecast[0];
 const rainComplete = forecast.length>0 && forecast.every(day=>day.rainMm!=null && day.rainProbability!=null);
 const cards = [
  card("Pest infestation",pestRisk,pests==="Observed"?"Pest observed; severity determines whether closer inspection is needed.":pestConflict?"Pest status says none observed, but pest details or severity are also recorded. Recheck the inspection.":pests==="None observed"?"No pests observed during this inspection.":"Pest status is unknown. Inspection is needed.",storageActions.inspection,[findings.pestType,severity].filter(Boolean).join(" · ")||undefined,undefined,storageSources.hotRegions),
  card("Disease symptoms",diseaseRisk,disease==="Observed"?"Symptoms recorded. This is not a confirmed diagnosis.":disease==="None observed"&&symptoms?"No disease symptoms was selected, but symptom notes are present. Recheck this inspection.":disease==="None observed"?"No disease symptoms observed during this inspection.":"Disease symptom status is unknown. Inspection is needed.",
   storageActions.inspection,symptoms,undefined,storageSources.codex),
  card("Visible mold",moldRisk,mold==="Observed"?"Visible mold recorded. Keep affected produce separate and arrange appropriate inspection.":mold==="None observed"?"No visible mold observed during this inspection.":"Mold status is unknown. Inspection is needed.",
   mold==="Observed"?storageActions.segregation:storageActions.inspection,undefined,undefined,storageSources.codex),
  card("Grain moisture",moisture==null||!moistureGuideline.available?"Inspection required":moistureExceeded?"Potential concern":"No current concern",
   moisture==null?"Moisture reading not recorded. Measure grain moisture as wet-basis percentage.":!moistureGuideline.available?`Guideline unavailable. ${moistureGuideline.reason}`:moistureExceeded?"Above the published crop and duration-specific moisture guideline.":withinReference,storageActions.moisture,
   moisture==null?undefined:`${moisture}% wet basis`,moistureGuideline.available?`${reference!.strictMaximum?"<":"≤"} ${reference!.moisture}% · ${reference!.duration}`:undefined,moistureGuideline.available?reference!.source:reference?.source),
  climateCard("Indoor temperature (°C)",temperature,reference?.temperature,"°C"),
  climateCard("Indoor relative humidity (%)",humidity,reference?.humidity,"%"),
  card("Storage condition",leakage==="Observed"?"High concern":poor||moderate?"Potential concern":
   (condition==="Good"||condition==="Clean and dry")&&ventilation==="Good"&&leakage==="None observed"?"No current concern":"Insufficient data",
   leakage==="Observed"?"Water leakage reported.":poor||moderate?"Dampness or poor airflow can allow damage to spread.":condition,storageActions.structure,[findings.storageType,ventilation,leakage].filter(Boolean).join(" · ")||undefined,undefined,storageSources.codex),
  card("Rainfall probability",rain?"Potential concern":rainComplete?"No current concern":"Insufficient data",
   rain?"Rain may wet exposed grain or enter a leaking store.":"Rainfall forecast",storageActions.rain,
   rainReading?`${rainReading.date} · ${rainReading.rainMm==null?"Unknown":`${rainReading.rainMm} mm`} · ${rainReading.rainProbability==null?"Unknown":`${rainReading.rainProbability}%`}`:undefined),
 ];
 const inspectionCards=cards.filter(item=>item.label!=="Rainfall probability");
 const rank:Record<Status,number>={"No current concern":0,"Insufficient data":1,"Inspection required":2,"Potential concern":3,"High concern":4};
 const status=inspectionCards.reduce<Status>((highest,item)=>rank[item.status]>rank[highest]?item.status:highest,"No current concern");
 const drivers=inspectionCards.filter(item=>item.status!=="No current concern").map(item=>({label:item.label,status:item.status,note:item.note}));
 return {cards,status,reference,drivers};
}
