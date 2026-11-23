import { isDemoSoilSample } from "./soil-sample-mode";
import type { SoilHealthInput } from "./soil-health";
export const officialLossSources=[
 {title:"IMD current district agromet bulletins",url:"https://mausam.imd.gov.in/imd_latest/contents/agromet/advisory/benglishmain.php",scope:"Open the district bulletin and verify issue/validity dates. Link only; no IMD API or automated district interpretation is claimed."},
 {title:"ICAR-CRIDA agromet advisory archive",url:"https://icar-crida.res.in/Weather_info_Agromet_Advisory.html",scope:"Official national/extended-range bulletin index; check geographic scope and date. Link only."},
];
export type PreventionAlert={code:string;message:string;source:string;sourceUrl:string;timestamp:string;uncertainty:string};
export function rainExposureAlerts(input:{stage:string|null;harvested:boolean;daily:{time:string[];precipitation_sum:Array<number|null>;precipitation_probability_max:Array<number|null>};fetchedAt:string;demo?:boolean},today:string):PreventionAlert[]{
 if(input.demo||!(input.harvested||input.stage==="Maturity"))return [];
 return input.daily.time.flatMap((date,index)=>{
 const rain=input.daily.precipitation_sum[index],chance=input.daily.precipitation_probability_max[index];
 if(date<today||date>new Date(Date.parse(`${today}T00:00:00Z`)+2*86400000).toISOString().slice(0,10)||rain===null||!Number.isFinite(rain)||rain<=0)return [];
 return [{code:`rain-exposure:${date}`,message:`Rain is forecast on ${date}: ${rain} mm; precipitation probability ${chance===null||chance===undefined||!Number.isFinite(chance)||chance<0||chance>100?"unavailable":`${chance}%`}. Inspect exposed mature/harvested produce and review local harvest/storage protection advice. This is an exposure reminder, not a crop-loss prediction.`,source:"Open-Meteo at saved farm coordinates",sourceUrl:"https://open-meteo.com/",timestamp:input.fetchedAt,uncertainty:"Model forecast; field rainfall and damage may differ. Probability describes precipitation, not crop loss. No severity threshold or expected loss is inferred."}];
 });
}
function compatibleLossSoilReport(input:SoilHealthInput,report:unknown){
 if(isDemoSoilSample(input,report as never)||input.mode!=="REAL")return null;
 const data=report as {analysisVersion?:string;ph?:{rating:string;sourceUrl?:string};organicCarbon?:{name:string;rating:string;sourceUrl?:string;reference?:{method:string}};laboratoryConfirmed?:boolean;nutrients?:Array<{name:string;rating:string;sourceUrl?:string;reference?:{method:string}}>};
 if(!data?.laboratoryConfirmed || !["soil-modes-v4","soil-basis-v5"].includes(String(data.analysisVersion)) || input.labReferenceConfirmed!==true || !input.laboratoryName?.trim())return null;
 return data;
}

export function lossSoilPh(input:SoilHealthInput,report:unknown){
 const ph=compatibleLossSoilReport(input,report)?.ph;
 const value=input.soilPh;
 return ph?.sourceUrl&&ph.rating!=="Unknown"&&typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=14
  ?{value,neutral:ph.rating==="Neutral"}:null;
}

export function soilLossAlerts(input:SoilHealthInput,report:unknown,timestamp:string):PreventionAlert[]{
 const data=compatibleLossSoilReport(input,report);
 if(!data)return [];
 const rows=[...(data.nutrients??[]),...(data.organicCarbon?[data.organicCarbon]:[])];
 const result=rows.filter(row=>["Low","High"].includes(row.rating)&&row.reference?.method&&row.sourceUrl).map(row=>({code:`soil:${row.name}:${row.rating}`,message:`Recorded ${row.name} status: ${row.rating}. Review this dated laboratory interpretation with the crop-specific SHC/KVK adviser. It does not prove the cause of crop loss or determine a fertilizer dose.`,source:"Saved method-compatible soil interpretation (farmer-recorded applicability confirmation)",sourceUrl:row.sourceUrl!,timestamp,uncertainty:"Historical sample; current field conditions may differ. Baseline classes are indicative, not a calibrated yield-loss model."}));
 if(data.ph?.sourceUrl && !["Unknown","Neutral"].includes(data.ph.rating))result.push({code:"soil:ph-review",message:`Recorded method-compatible pH class: ${data.ph.rating}. Review crop suitability with the issuing laboratory; pH alone cannot determine lime/gypsum or crop loss.`,source:"Saved method-specific soil pH interpretation",sourceUrl:data.ph.sourceUrl,timestamp,uncertainty:"Dated laboratory sample, not current field monitoring or a prediction of loss."});
 return result;
}

export const maizeEstablishmentSource={
 title:"TNAU Agritech · Irrigated maize water management",url:"https://agritech.tnau.ac.in/agriculture/millets_maize_irrigated_maize_water.html",
 scope:"Tamil Nadu irrigated-maize guidance, reviewed 2026-11-14. Qualitative moisture/drainage guidance only; no Bihar-specific rainfall damage threshold, irrigation interval, dose or loss probability is transferred.",
};
export function maizeEstablishmentGuidance(crop:string,stage:string|null){
 if(!["maize","corn","makka"].includes(crop.trim().toLowerCase())||stage!=="Establishment")return null;
 return {...maizeEstablishmentSource,message:"During maize establishment, inspect both soil moisture and standing water. The source identifies sensitivity to both moisture stress and excess moisture. Use measured field conditions and the existing irrigation planner before deciding to irrigate; no fixed dose is inferred.",href:"/irrigation"};
}
export function establishmentRainAlerts(input:{crop:string;stage:string|null;daily:{time:string[];precipitation_sum:Array<number|null>;precipitation_probability_max:Array<number|null>};fetchedAt:string;demo?:boolean},today:string):PreventionAlert[]{
 if(input.demo||!maizeEstablishmentGuidance(input.crop,input.stage))return [];
 const end=new Date(Date.parse(`${today}T00:00:00Z`)+2*86400000).toISOString().slice(0,10);
 return input.daily.time.flatMap((date,index)=>{
 const rain=input.daily.precipitation_sum[index],chance=input.daily.precipitation_probability_max[index];
 if(date<today||date>end||rain===null||!Number.isFinite(rain)||rain<=0)return [];
 return [{code:`maize-establishment-rain:${date}`,message:`Maize is recorded at Establishment. Forecast rain on ${date}: ${rain} mm; precipitation probability ${typeof chance==="number"&&Number.isFinite(chance)&&chance>=0&&chance<=100?`${chance}%`:"unavailable"}. Inspect seedling soil moisture and drainage before irrigation. This is a precautionary field check, not evidence of waterlogging or predicted loss.`,source:"Open-Meteo model forecast + TNAU qualitative maize moisture guidance",sourceUrl:maizeEstablishmentSource.url,timestamp:input.fetchedAt,uncertainty:`Field rainfall and soil moisture may differ from the forecast. Precipitation probability is not damage probability. ${maizeEstablishmentSource.scope}`}];
 });
}

export function deficientSoilReadings(input:SoilHealthInput, report:unknown) {
 const valid=compatibleLossSoilReport(input,report);
 const rows=(valid?.nutrients??[]) as import("./soil-health").SoilRating[];
 return rows.filter(row=>row.rating==="Low"&&typeof row.value==="number"&&Number.isFinite(row.value)&&row.unit&&row.sourceUrl&&row.reference?.method)
  .map(row=>({
   name:row.name,value:row.value,unit:row.unit,basis:row.basis,method:row.method,
   sourceUrl:row.sourceUrl,reference:row.reference,range:row.range,interpretation:row.interpretation,
  }));
}
