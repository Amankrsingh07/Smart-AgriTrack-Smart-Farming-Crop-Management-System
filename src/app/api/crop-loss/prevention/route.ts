import {simplifyHarvestActions} from "@/lib/crop-loss-wording";
import {inspectionReminderKey,readLossReminders} from "@/lib/crop-loss-reminders";
import {languages,isLanguageCode,languageName} from "@/i18n/languages";
import {storageRisk} from "@/lib/crop-loss-storage";
import type {Prisma} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { readCropLossWeather } from "@/lib/crop-loss-weather";
import { indiaDateKey } from "@/lib/crop-cycle-status";
import { savedCropSoilAdvice } from "@/lib/saved-crop-soil-advice";
import { accessibleOfficialAdvisories } from "@/lib/crop-loss-advisories";
import { preventionSoilContext } from "@/lib/crop-loss-soil-context";
import {rainExposureAlerts,soilLossAlerts,lossSoilPh,deficientSoilReadings,establishmentRainAlerts,maizeEstablishmentGuidance,type PreventionAlert } from "@/lib/crop-loss-prevention";
import {harvestRiskDetails} from "@/lib/crop-loss-risk";
import {readHarvestRiskRecords} from "@/lib/crop-loss-risk-records";
import {harvestDashboard,type LossActionId} from "@/lib/crop-loss-dashboard";
import type { SoilHealthInput } from "@/lib/soil-health";
// Share simultaneous provider calls and keep the cache bounded. No farmer text or photos enter the wording cache.
const providerCache=new Map<string,{expires:number;result:Promise<unknown>}>();
function cached<T>(key:string,ttl:number,load:()=>Promise<T>):Promise<T>{
 const existing=providerCache.get(key);
 if(existing&&existing.expires>Date.now())return existing.result as Promise<T>;
 if(providerCache.size>=64)providerCache.delete(providerCache.keys().next().value!);
 const result=load();
 providerCache.set(key,{expires:Date.now()+ttl,result});
 return result;
}

export async function POST(request:Request){
 const user=await getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const parsed=z.object({cropCycleId:z.string().min(1).max(191),remind:z.boolean().default(false),simplify:z.boolean().default(false),automatic:z.boolean().default(false),locale:z.enum(languages.map(language=>language.code)).default("en"),productionId:z.string().min(1).max(191).optional()}).safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Select a saved crop cycle."},{status:400});
 const automatic=parsed.data.automatic;
 if(!checkRateLimit(`crop-loss-prevention:${automatic?"automatic":"manual"}:${user.id}`,automatic?20:6).allowed)
  return NextResponse.json({error:"Too many requests. Try in a minute."},{status:429});
 try{
 const cycle=await db.cropCycle.findFirst({where:{id:parsed.data.cropCycleId,field:{farm:{userId:user.id}}},include:{crop:true,field:{include:{farm:true}},productions:{include:{lossAssessment:true,storageInspections:{orderBy:{version:"desc"},take:1}}}}});
 if(!cycle)return NextResponse.json({error:"Crop cycle not found."},{status:404});
 const lot=parsed.data.productionId?cycle.productions.find(p=>p.id===parsed.data.productionId):null;
 if(parsed.data.productionId&&!lot)return NextResponse.json({error:"Harvest lot not found."},{status:404});
 const officialSources=cached("official",15*60_000,accessibleOfficialAdvisories);
 const riskRecords=readHarvestRiskRecords(user.id,{id:cycle.id,cropId:cycle.cropId,stage:cycle.growthStage});
 const farm=cycle.field.farm;const checkedAt=new Date().toISOString();
 const {source:weatherSource,forecast,fetchedAt:weatherFetchedAt,issue:weatherIssue}=await readCropLossWeather(
  farm.latitude===null?null:Number(farm.latitude),farm.longitude===null?null:Number(farm.longitude),automatic,
 );
 const weatherStatus=forecast
  ?`${weatherSource} · Open-Meteo model forecast fetched ${weatherFetchedAt}. Model timezone: ${forecast.timezone??"unspecified"}.`
  :`Insufficient Data: ${weatherIssue?.message} Weather evidence is unavailable.`;
 let forecastPreview:{date:string;rainMm:number|null;rainProbability:number|null;minC:number|null;maxC:number|null}[]=[];
 let currentWeather:{temperature:number|null;humidity:number|null}|null=null;
 let alerts:PreventionAlert[]=[];
 if(forecast&&weatherFetchedAt){
  const {temperature_2m,relative_humidity_2m}=forecast.current;
  currentWeather={temperature:Number.isFinite(temperature_2m)?temperature_2m:null,
   humidity:Number.isFinite(relative_humidity_2m)&&relative_humidity_2m>=0&&relative_humidity_2m<=100?relative_humidity_2m:null};
  const today=indiaDateKey(new Date());
  alerts=[...rainExposureAlerts({stage:cycle.growthStage,harvested:cycle.productions.length>0,daily:forecast.daily,fetchedAt:weatherFetchedAt},today),
   ...establishmentRainAlerts({crop:cycle.crop.name,stage:cycle.growthStage,daily:forecast.daily,fetchedAt:weatherFetchedAt},today)];
  forecastPreview=forecast.daily.time.flatMap((date,index)=>date<today?[]:[{date,rainMm:forecast.daily.precipitation_sum[index],
   rainProbability:forecast.daily.precipitation_probability_max[index],minC:forecast.daily.temperature_2m_min[index],maxC:forecast.daily.temperature_2m_max[index]}]).slice(0,3);
 }
 const tests=await db.fertilizerRecommendationHistory.findMany({where:{userId:user.id,fieldId:cycle.fieldId},orderBy:[{sampleDate:"desc"},{createdAt:"desc"}],take:50});
 const soilContext=preventionSoilContext(tests,{fieldId:cycle.fieldId,cropId:cycle.cropId,cropCycleId:cycle.id,crop:cycle.crop.name});
 const soil=soilContext.selected;
 const ph=soil?lossSoilPh(soil.input as SoilHealthInput,soil.result):null;
 if(soil)alerts.push(...soilLossAlerts(soil.input as SoilHealthInput,soil.result,soil.sampleDate!.toISOString()));
 const advice=savedCropSoilAdvice({crop:cycle.crop.name,soil:cycle.field.soilType,state:farm.state,district:farm.district,ph:null,texture:cycle.field.soilTexture});
 const fieldLots=await db.production.findMany({where:{cropCycle:{fieldId:cycle.fieldId},lossAssessment:{is:{quantitiesConfirmed:true}}},include:{lossAssessment:true,cropCycle:{include:{crop:true}}},orderBy:{harvestDate:"desc"},take:30});
 const history=fieldLots.filter(p=>p.lossAssessment?.quantitiesConfirmed).map(p=>({harvestDate:p.harvestDate.toISOString().slice(0,10),crop:p.cropCycle.crop.name,cause:p.lossAssessment!.cause,damaged:p.lossAssessment!.damaged.toString(),wasted:p.lossAssessment!.wasted.toString(),unit:p.unit}));
 const records=await riskRecords;
 const assessments=(lot?[lot]:cycle.productions).flatMap(p=>{
  const a=p.lossAssessment;
  return a?.quantitiesConfirmed&&a.harvestedSnapshot.eq(p.quantity)&&a.unit===p.unit?[a]:[];
 });
 const today=indiaDateKey(new Date());
 const firstForecast=forecastPreview.find(day=>day.date>=today);
 const harvested=!!lot||cycle.productions.length>0;
 const causes=[...assessments.map(a=>a.cause),...history.filter(h=>h.crop===cycle.crop.name).map(h=>h.cause)];
 const storageLot=lot??[...cycle.productions].sort((a,b)=>b.harvestDate.getTime()-a.harvestDate.getTime())[0];
 const upcomingRain=forecastPreview.find(day=>day.date>=today&&day.rainMm!=null&&day.rainMm>0);
 const riskDetails=harvestRiskDetails({crop:cycle.crop.name,stage:cycle.growthStage,harvested,...records,
  outdoorWeather:currentWeather?`${currentWeather.temperature??"Unknown"} °C · ${currentWeather.humidity??"Unknown"}%`:undefined,
  historicalStorageConcern:causes.includes("Storage"),pestOrDiseaseHistory:causes.includes("Pest or disease observed"),
  storageDetails:storageLot?.storageDetails,soilType:cycle.field.soilType,soilTexture:cycle.field.soilTexture,
  fieldNotes:cycle.field.notes,soilReportDate:soil?.sampleDate?.toISOString().slice(0,10),
  forecastRain:upcomingRain?{value:`${upcomingRain.rainMm} mm`,date:upcomingRain.date}:null,
 });
 const riskActions:LossActionId[]=[];
 const recorded=(index:number)=>["Confirmed observation","AI-suspected condition","Potential concern"].includes(riskDetails[index].status);
 if(!harvested&&(recorded(0)||causes.includes("Pest or disease observed")))riskActions.push("field-pests");
 if(!harvested&&recorded(1))riskActions.push("field-disease");
 if(recorded(2)||(!harvested&&upcomingRain))riskActions.push("drainage");
 const dashboard=harvestDashboard({crop:cycle.crop.name,stage:cycle.growthStage,harvested,causes,riskActions,
  hasAffected:assessments.some(a=>a.damaged.gt(0)||a.wasted.gt(0)),rainProbability:firstForecast?.rainProbability,
  rainExposure:alerts.some(a=>a.code.startsWith("rain-exposure:")||a.code.startsWith("maize-establishment-rain:")),
  ...currentWeather,diseaseSigns:recorded(1),
  lowNutrients:alerts.some(a=>a.code.startsWith("soil:")&&a.code.endsWith(":Low")),
  phConcern:alerts.some(a=>a.code==="soil:ph-review"),phReading:ph?.value,neutralPh:ph?.neutral,
  drainageReview:recorded(2)});
 const wordingOptions={apiKey:process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY,model:process.env.GEMINI_MODEL};
 const locale=parsed.data.locale;
 const simplify=()=>simplifyHarvestActions(dashboard.actions,{...wordingOptions,locale,language:isLanguageCode(locale)?languageName(locale):"English"});
 const wording=parsed.data.automatic&&wordingOptions.apiKey&&wordingOptions.model
  ?await cached(`wording:${wordingOptions.model}:${locale}:${dashboard.actions.map(action=>action.id).join(",")}`,10*60_000,simplify)
  :parsed.data.simplify?await simplify():{mode:"offline",actions:dashboard.actions};
 const improvedRisks=dashboard.risks.map(risk=>riskDetails.find(detail=>detail.label===risk.label)??risk);
 const requestedActions=dashboard.actions.filter(action=>parsed.data.remind
  ? dashboard.reminderIds.includes(action.id)||riskActions.includes(action.id)
  : parsed.data.automatic&&(riskActions.includes(action.id)||(harvested&&action.id==="weather"&&upcomingRain)||(harvested&&action.id==="pests"&&(recorded(0)||causes.includes("Storage")))));
 const title="Crop loss prevention review";
 const inspection=storageLot?.storageInspections[0];
 const findings=inspection ? storageRisk(inspection.findings as Parameters<typeof storageRisk>[0],cycle.crop.name,forecastPreview) : undefined;
 const storageAdvice=(findings?.cards??[]).filter(card=>["Potential concern","High concern","Inspection required"].includes(card.status))
  .map(card=>({id:card.label,text:card.note,short:card.action}));
 const explainStorage=()=>simplifyHarvestActions(storageAdvice,{...wordingOptions,locale,language:isLanguageCode(locale)?languageName(locale):"English"});
 const storageWording=storageAdvice.length&&(automatic||parsed.data.simplify)
  ?cached(`storage-wording:${locale}:${JSON.stringify(storageAdvice)}`,10*60_000,explainStorage)
  :Promise.resolve(null);
 const href=(productionId?:string|null)=>`/crop-loss?cycle=${encodeURIComponent(cycle.id)}${productionId?`&lot=${encodeURIComponent(productionId)}`:""}`;
 const rows:Prisma.AlertCreateManyInput[]=requestedActions.map(action=>{
  const productionId=["moisture","store","pests","crates"].includes(action.id)?storageLot?.id:null;
  const dueOn=action.id==="soil"&&cycle.expectedHarvestDate&&cycle.expectedHarvestDate>new Date(today)?cycle.expectedHarvestDate:new Date(today);
  return {userId:user.id,dedupeKey:inspectionReminderKey(cycle.id,action.id,productionId),title,message:action.short,
   actionId:action.id,cropName:cycle.crop.name,productionId,dueOn,
   priority:riskActions.includes(action.id)||action.id==="pests"&&findings?.cards.some(r=>r.label==="Pest infestation"&&r.status==="Potential concern")?"High":"Medium",
   href:href(productionId)};
 });
 if(parsed.data.remind){
  const legacy=await db.alert.findMany({where:{userId:user.id,dedupeKey:{startsWith:`loss:${cycle.id}:`}},select:{dedupeKey:true}});
  for(const alert of alerts){
   const dedupeKey=`loss:${cycle.id}:${alert.code}`;
   if(legacy.some(row=>row.dedupeKey?.startsWith(dedupeKey+":")))continue;
   const date=alert.code.match(/:(\d{4}-\d{2}-\d{2})$/)?.[1];
   rows.push({userId:user.id,dedupeKey,title,
    message:`${alert.message}\nSource: ${alert.sourceUrl}\nData time: ${alert.timestamp}\n${alert.uncertainty}`,
    actionId:date?"weather":"soil",cropName:cycle.crop.name,productionId:null,dueOn:new Date(date??today),priority:date?"High":"Medium",href:href()});
  }
 }
 const reminderCount=rows.length?(await db.alert.createMany({data:rows,skipDuplicates:true})).count:0;
 const reminders=(parsed.data.remind||parsed.data.automatic)?await readLossReminders(user.id):undefined;
 return NextResponse.json({dashboard:{...dashboard,...wording,storageWording:await storageWording,risks:improvedRisks,riskDetails,photoReport:records.photoReport,storageRisks:findings},reminders,currentWeather,checkedAt,crop:cycle.crop.name,stage:cycle.growthStage??"Insufficient Data",weatherStatus,weatherSource,weatherIssue,weatherFetchedAt,forecastPreview,soilStatus:soilContext.status,deficiencies:soil?deficientSoilReadings(soil.input as SoilHealthInput,soil.result):[],sampleDate:soil?.sampleDate,soilDetails:{issues:soilContext.issues,reportId:soilContext.reportId,checkedReports:soilContext.checkedReports,otherCropReports:soilContext.otherCropReports,scope:"Up to 50 newest field soil reports reviewed; indicators with missing measurements or incompatible methods remain Unknown."},stageGuidance:maizeEstablishmentGuidance(cycle.crop.name,cycle.growthStage),alerts,advice:{summary:advice.summary,drainage:advice.drainage,nutrientPlan:advice.nutrientPlan,scope:advice.scope,sources:advice.sources},history,officialSources:await officialSources,reminderCount,limitations:"No disease diagnosis, predicted yield loss, pesticide dose, fertilizer dose or weather severity classification. Review official district bulletins; official index links are retrieved when accessible, but bulletin advice is not automatically interpreted."},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Prevention context unavailable. Please retry."},{status:503});}
}
