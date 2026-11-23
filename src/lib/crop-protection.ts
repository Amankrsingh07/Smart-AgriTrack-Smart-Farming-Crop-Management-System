import {agriculturalKnowledge,knowledgeManifest,normalizeProtectionCrop,knowledgeCoverage} from "./agricultural-knowledge";
import {assessProtectionLabs} from "./crop-protection-labs";
import {indiaDateKey} from "./crop-cycle-status";
import { z } from "zod";
import {applicationSchema,assessApplications} from "./crop-protection-applications";
import {buildProtectionPlan,protectionUrgency} from "./crop-protection-plan";
export const disclaimer = "Preliminary agricultural assessment. This report is not a substitute for laboratory testing or professional diagnosis.";
export const generalSymptoms = ["Yellow leaves","Brown leaves","Black spots","White powder","Leaf curling","Leaf burning","Dry leaf edges","Holes in leaves","Leaf discoloration","Sudden leaf falling","Plant wilting","Stunted growth","Weak stems","Plant falling","Drying plants","Uneven growth","Poor flowering","Poor fruit formation","Root rot","Black roots","Brown roots","Weak roots","Root damage","Bad smell around roots","Water standing in field","Unusual smell in soil","White salt deposits","Unusual water color","Reduced crop yield","Crop damage in specific field areas","Stem lesions","Fruit lesions","Fruit holes","Leaf mines"] as const;
export const cropVisualSymptoms = [
 "Pointed spots with gray centers and brown edges",
 "Long yellow streaks from leaf tips with wavy edges",
 "Brown spots with rings inside",
 "Spots started on older lower leaves",
 "Small round spots with pale centers and dark specks",
 "Orange-yellow leaf tips with fewer shoots",
 "Brown insects at the base of rice stems",
 "Even yellowing on older leaves",
 "Twisted or cup-shaped new leaves",
] as const;
export const symptoms = [...generalSymptoms, ...cropVisualSymptoms] as const;

export const pollutionQuestions = ["Industrial area nearby","Factory nearby","Wastewater enters field","Water from drain","Water color changed","Unusual smell","Visible upstream discharge","Problem after discharge","Neighboring fields affected"] as const;
export const recoveryStatuses = ["Improved","No change","Condition worsened","Partially recovered","Expert review required"] as const;
const text = z.string().trim().max(2000).default("");
export const labSchema = z.object({ matrix:z.enum(["Soil","Water"]), parameter:z.string().trim().min(1).max(80), value:z.number().finite().nonnegative(), unit:z.string().trim().min(1).max(30), method:text, laboratory:text, sampleDate:z.iso.date().refine(v=>v<=indiaDateKey(new Date()),"Sample date cannot be in the future."), reportReference:text,sampleLocation:z.string().trim().max(2000).optional(),referenceStandard:z.string().trim().max(2000).optional() });
export const protectionSchema = z.object({
 cropCycleId:z.string().max(100).optional(), cropName:z.string().trim().min(1).max(120), variety:text, state:text,district:text,village:text,field:text,area:text,sowingDate:text,stage:text,irrigation:text,soilType:text,
 symptoms:z.array(z.enum(symptoms)).max(symptoms.length), affected:z.enum(["Less than 10%","10–25%","25–50%","50–75%","More than 75%"]), onset:z.iso.date().refine(v=>v<=indiaDateKey(new Date()),"Problem start cannot be in the future."), spreading:z.boolean(), pattern:z.enum(["Entire field","One section","Scattered"]), timing:z.enum(["Suddenly","Gradually"]),
 fertilizerHistory:text, chemicalHistory:text, symptomsAfterApplication:z.boolean(), pollution:z.array(z.enum(pollutionQuestions)).max(9), dischargeDetails:text, waterSource:text,
 applications:z.array(applicationSchema).max(30).default([]),
 fieldHistory:z.object({rootCondition:text,soilMoisture:z.enum(["Unknown","Dry","Moist","Waterlogged"]).default("Unknown"),diseaseHistory:text,recentRainfall:text}).default({rootCondition:"",soilMoisture:"Unknown",diseaseHistory:"",recentRainfall:""}),
 discharge:z.object({observedAt:z.string().max(40).default(""),distanceMetres:z.number().finite().nonnegative().optional(),pattern:z.enum(["Unknown","One event","Seasonal","Continuous"]).default("Unknown"),affectedSections:text}).default({observedAt:"",pattern:"Unknown",affectedSections:""}),
 labs:z.array(labSchema).max(50).default([])
});
export type ProtectionInput = z.infer<typeof protectionSchema>;
export const sources = [
 {name:"FAO Water quality for agriculture, Irrigation and Drainage Paper 29 Rev.1 (1985)",url:"https://www.fao.org/4/t0234e/t0234e00.htm"},
 {name:"ICAR-IIHR crop production and protection portal",url:"https://webapps.iihr.res.in/"},
 {name:"MANAGE DAESI study material: integrated pest management",url:"https://www.manage.gov.in/publications/eBooks/Revised%20DAESI%20Study%20Material.pdf"}
];
export const diseaseRegistry=agriculturalKnowledge.records;
export const supportedProtectionCrops=[...knowledgeManifest.coverage.namedCrops,"Gram"];
export interface ImageClassifier { classify(bytes:Uint8Array,crop:string):Promise<{available:boolean; candidates: {name:string;score:number}[]}> }
export const imageClassifier:ImageClassifier = {async classify(){return {available:false,candidates:[]};}};
export type ProtectionContext={
 weather?:{time:string;humidity:number;rainfall:number;source:string};
 soilReport?:{id:string;sampleDate:string|null;summary?:{ph:string;nutrients:{name:string;rating:string;guidance:string;sourceUrl?:string}[];limitations:string}}|null;
 fertilizerHistory?:{product:string;quantityKg:string;date:string|null;method:string|null}[];
 irrigationHistory?:{date:string;method:string|null;source:string|null;lastWateredAt:string|null}[];
};

function cropRecords(cropName:string) {
 const crop=normalizeProtectionCrop(cropName);
 return diseaseRegistry.filter(record=>record.crops.some(name=>normalizeProtectionCrop(name)===crop));
}

export function cropSymptomOptions(cropName:string) {
 return [...new Set(cropRecords(cropName).flatMap(record=>record.symptoms))];
}

export function assessProtection(input:ProtectionInput,context:ProtectionContext={},imageSymptoms:readonly string[]=[]) {
 const selected=new Set<string>(input.symptoms);
 const observed=new Set(imageSymptoms);
 const records=cropRecords(input.cropName);
 // Standing water can be expected in rice. Keep the existing water review without assuming damage.
 const waterlogged=input.fieldHistory?.soilMoisture==="Waterlogged";
 const candidates=records.flatMap(record=>{
  const matchingSymptoms=record.symptoms.filter(sign=>selected.has(sign));
  const photoMatches=record.symptoms.filter(sign=>observed.has(sign));
  const distinctive=(record.distinguishingSymptoms??[]).filter(sign=>
   selected.has(sign)||observed.has(sign)||(record.id==="root-waterlogging"&&waterlogged));
  if(!matchingSymptoms.length&&!photoMatches.length&&!distinctive.length)return [];
  const competing=(record.competingSymptoms??[]).filter(sign=>selected.has(sign)||observed.has(sign));
  const infection=/Fungal|Bacterial|Viral|Oomycete/.test(record.category);
  const contradictions=[
   ...competing,
   ...(infection&&input.symptomsAfterApplication?["Symptoms began after a product application."]:[]),
   ...(infection&&waterlogged?["Waterlogged soil could also explain the damage."]:[]),
   ...(record.id==="root-waterlogging"&&input.fieldHistory?.soilMoisture==="Dry"?["The farmer reported dry soil."]:[]),
  ];
  const fieldEvidence=[
   ...(record.id==="root-waterlogging"&&waterlogged?["Waterlogged soil reported."]:[]),
   ...(record.id==="tomato-herbicide"&&input.symptomsAfterApplication?["Symptoms began after a product application."]:[]),
   ...(record.id==="rice-nitrogen"&&(context.soilReport?.summary?.nutrients??[]).some(n=>/^nitrogen\b/i.test(n.name)&&n.rating.toLowerCase()==="low")?["The linked soil report lists low nitrogen."]:[]),
  ];
  return [{...record,matchingSymptoms,photoMatches,fieldEvidence,distinctive,competing,contradictions,
   confidence:distinctive.length?"Distinctive signs reported; unconfirmed":"General signs only; unconfirmed",
   missingInformation:["Distinctive lesion pattern and pathogen testing","Root and stem examination",...(!context.weather?["Actual recent weather"]:[]),...(!input.fieldHistory?.diseaseHistory?["Previous disease history"]:[])],
   fieldContext:{stage:input.stage||"Unknown",rootCondition:input.fieldHistory?.rootCondition||"Not provided",diseaseHistory:input.fieldHistory?.diseaseHistory||"Not provided"}}];
 });
 const direct = input.pollution.filter(v=>["Wastewater enters field","Water from drain","Visible upstream discharge","Problem after discharge"].includes(v));
 const observations = input.pollution.filter(v=>!["Industrial area nearby","Factory nearby"].includes(v));
 const pollutionStatus=direct.length>=2?"High Priority for Testing":observations.length?"Possible Pollution":"Low Indication";
 const suspects=[...candidates].sort((a,b)=>
  Number(b.distinctive.length>0&&b.competing.length===0)-Number(a.distinctive.length>0&&a.competing.length===0)||
  a.competing.length-b.competing.length||
  b.distinctive.length-a.distinctive.length||
  b.fieldEvidence.length-a.fieldEvidence.length||
  new Set([...b.matchingSymptoms,...b.photoMatches]).size-new Set([...a.matchingSymptoms,...a.photoMatches]).size)
  .filter(c=>c.distinctive.length||c.fieldEvidence.length||
   (!["Water stress","Chemical injury","Nutrient deficiency"].includes(c.category)&&
    new Set([...c.matchingSymptoms,...c.photoMatches]).size>1))
  .map(c=>({id:c.id,name:c.name,category:c.category,farmerSigns:c.matchingSymptoms,imageSigns:c.photoMatches,
   fieldEvidence:c.fieldEvidence,conflicts:c.contradictions,uncertainty:c.evidenceLimitations,
   nextCheck:c.diagnostics,prevention:c.prevention,management:c.management,recovery:c.recovery??c.diagnostics,
   source:{name:c.sourceOrganization,url:c.source}}));
 if(observations.length) {
  const pollution={id:"pollution-risk",name:"Possible contamination",category:"Pollution risk",
   farmerSigns:observations,imageSigns:[],fieldEvidence:[],conflicts:[],
   uncertainty:"Field signs alone cannot establish contamination or its source.",
   nextCheck:"Ask a qualified laboratory how to collect soil and water samples.",
   prevention:"Use a known safe irrigation source where available.",
   management:"Keep potentially affected produce separate pending safety advice.",
   recovery:"Review test results with an adviser before resuming use of the suspected water source.",
   source:sources[0]};
  if(direct.length)suspects.unshift(pollution);else suspects.push(pollution);
 }
 const applicationFindings=assessApplications(input.applications??[],input.cropName);
 const chemicalSuspected=input.symptomsAfterApplication && !!(input.chemicalHistory || input.fertilizerHistory || input.applications?.length);
 const alternatives=["Nutrient imbalance or deficiency","Water stress / root-zone oxygen shortage","Salinity or unsuitable soil pH",...(chemicalSuspected?["Possible application-related injury; timing does not establish causation"]:[])];
 const precautions=["Avoid additional fertilizer and chemicals until the cause is assessed.","Record affected areas and inspect comparable healthy plants.",...(observations.length?["Pause use of suspected contaminated water where a safe alternative is available; obtain expert irrigation advice.","Keep potentially contaminated produce separate; do not consume, sell or feed it to animals before a food/feed safety assessment."]:[])];
 const tests=["Crop diagnostic laboratory: examine symptomatic and healthy reference plants.","Soil: pH, EC (with extraction method), organic carbon, N, P, K; micronutrients according to crop symptoms.",...(observations.length?["Accredited laboratory: soil and water Pb, Cd, Cr, As, Hg, Ni; additional analytes based on source history.","Arrange safe, lawful upstream/downstream, field and control sampling with laboratory containers, preservation instructions and chain of custody."]:[]),"Water: EC, pH, TDS, sodium, chloride, bicarbonate, SAR and boron where irrigation injury is suspected."];
 const history=input.fieldHistory;
 const abioticFindings=[
  ...(input.symptoms.includes("Water standing in field")||history?.soilMoisture==="Waterlogged"?[{cause:"Waterlogging / root oxygen stress",evidence:"Standing water or waterlogged soil reported",nextStep:"Inspect drainage and roots with an adviser before the next irrigation; root infection can coexist."}]:[]),
  ...(history?.soilMoisture==="Dry"?[{cause:"Possible moisture stress",evidence:"Dry soil reported",nextStep:"Check root-zone moisture and irrigation delivery; wilting alone cannot establish drought."}]:[]),
  ...(input.symptoms.includes("White salt deposits")?[{cause:"Possible salt accumulation",evidence:"White deposits reported; composition unverified",nextStep:"Request method-labelled soil EC and irrigation water tests; do not prescribe leaching without drainage and water-quality assessment."}]:[]),
  ...(input.symptoms.includes("Yellow leaves")?[{cause:"Nutrient deficiency or impaired uptake",evidence:"Yellow leaves overlap with disease, root stress and injury",nextStep:"Review existing soil report, affected leaf position and crop stage; do not add fertilizer based on yellowing alone."}]:[])
 ];
 const urgency=protectionUrgency(input);
 const topSuspects=suspects.slice(0,3);
 const plan=buildProtectionPlan(input,context.weather);
 for(const suspect of topSuspects) {
  if(suspect.id==="pollution-risk")continue;
  plan.push({key:`check-${suspect.id}`,days:urgency.days,title:`${input.cropName} · ${suspect.name}`,reason:suspect.uncertainty,action:suspect.recovery});
 }
 const laboratory=assessProtectionLabs(input.labs);
 return {version:"rules-4",method:"Offline rule-based assessment",diagnosisStatus:"Insufficient information for a reliable diagnosis.",knowledge:knowledgeCoverage(input.cropName),context,applicationFindings,abioticFindings,urgency,plan,candidates,topSuspects,screeningStatus:topSuspects.length?"Possible causes found":"Insufficient Evidence",alternatives,chemicalSuspected,pollutionStatus,evidenceStatus:pollutionStatus==="Low Indication"?"Insufficient Evidence":pollutionStatus==="Possible Pollution"?"Possible Contamination":pollutionStatus,verification:"Unverified; farmer-submitted observations and laboratory entries",confidence:"Preliminary screening only; confidence labels are not calibrated probabilities",evidence:input.symptoms,missingInformation:["Qualified laboratory interpretation against a named, applicable reference","Registered chemical product label, formulation, dose per area and application weather",...(context.weather?[]:["Actual recent weather unavailable"]),...(!input.stage?["Current growth stage"]:[]),...(!history?.rootCondition?["Root condition"]:[]),...(!history?.diseaseHistory?["Previous disease history"]:[])],precautions,tests,laboratory,water:{status:laboratory.waterStatus,salinity:laboratory.waterSalinity,standard:sources[0]},soil:"Interpretation requires sample method, units, crop and local soil references. Heavy-metal entries are not automatically compared with universal limits.",recovery:["Immediate protection: apply the precautions above.","Identify cause: arrange the listed tests and local KVK/agricultural expert review.","Treatment: crop and registered product-specific advice after diagnosis; no dose, mixing, flooding or amendment prescription from this screen.","Monitor: compare new growth and affected area in 3–7 days; seek urgent expert review if rapidly worsening.","Recovery cannot be guaranteed."],prevention:[...(context.weather&&context.weather.humidity>=80?["High humidity in the available actual weather: inspect for new lesions and canopy wetness; this does not establish disease."]:[]),...(input.symptoms.includes("Water standing in field")?["Inspect drainage and root-zone conditions before the next irrigation; obtain field advice rather than flooding."]:[]),`Inspect ${input.cropName} at ${input.stage||"the recorded growth stage"} regularly and log changes.`,"Use soil-test-based fertilizer plans; record every product application.","Check moisture and drainage before irrigating; use existing calendar activities to avoid duplicate reminders."],sourceAttribution:"No industrial source established. Proximity, statements and photographs cannot attribute crop damage to a factory.",imageAnalysis:"Photographic supporting evidence only",disclaimer,sources};
}
export function validateProtectionPhoto(bytes:Uint8Array,type:string) {
 if(!bytes.length||bytes.length>5*1024*1024)throw new Error("Each image must be nonempty and at most 5 MB.");
 const b=Buffer.from(bytes); const detected=b[0]===255&&b[1]===216&&b[2]===255?"image/jpeg":b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WEBP"?"image/webp":null;
 if(!detected||detected!==type)throw new Error("Only matching JPEG, PNG and WEBP content is accepted.");
 return detected;
}
