import {db} from "./db";
import {z} from "zod";
import {symptoms} from "./crop-protection";

const savedProtection=z.object({
 symptoms:z.array(z.enum(symptoms)).optional(),
 fieldHistory:z.object({soilMoisture:z.string().optional()}).optional(),
});
const savedFindings=z.object({
 topSuspects:z.array(z.object({id:z.string()})).optional(),
 visionObservations:z.record(z.string(),z.object({visibleSymptoms:z.array(z.enum(symptoms)),checkedAt:z.iso.datetime()})).optional(),
});
const dateOnly=(value:Date)=>value.toISOString().slice(0,10);

export async function readHarvestRiskRecords(userId:string,cycle:{id:string;cropId:string;stage:string|null},now=new Date()){
 const scoped={userId,cropCycleId:cycle.id};
 const [protection,rain,irrigation,rainMoisture,irrigationMoisture,water]=await Promise.all([
  db.cropProtectionAssessment.findFirst({
   where:scoped,orderBy:[{createdAt:"desc"},{id:"desc"}],
   select:{id:true,input:true,findings:true,createdAt:true,photos:{orderBy:{id:"asc"},select:{id:true}}},
  }).catch(()=>null),
  db.rainfallObservation.findMany({where:{...scoped,source:{in:["MANUAL_OBSERVATION","WEATHER_STATION"]},rainfallDate:{lte:now}},take:7,
   orderBy:[{rainfallDate:"desc"},{recordedAt:"desc"}],select:{rainfallDate:true,grossRainfallMm:true}}).catch(()=>null),
  db.irrigationSchedule.findFirst({where:{...scoped,completedAt:{lte:now},isCheckOnly:false},
   orderBy:{completedAt:"desc"},select:{completedAt:true,method:true}}).catch(()=>null),
  db.rainfallObservation.findFirst({where:{...scoped,source:{in:["MANUAL_OBSERVATION","WEATHER_STATION"]},moistureMeasuredDate:{lte:now},soilCurrentMoisturePercent:{not:null}},
   orderBy:[{moistureMeasuredDate:"desc"},{recordedAt:"desc"}],select:{moistureMeasuredDate:true,soilCurrentMoisturePercent:true}}).catch(()=>null),
  db.irrigationSchedule.findFirst({where:{...scoped,completedAt:{lte:now},soilMoistureSource:"MEASURED",soilMoisturePercent:{not:null}},
   orderBy:{completedAt:"desc"},select:{completedAt:true,soilMoisturePercent:true}}).catch(()=>null),
  cycle.stage?db.cropWaterStage.findFirst({where:{cropId:cycle.cropId,stageName:cycle.stage,dataStatus:"VERIFIED",verifiedAt:{not:null},
   sourceUrl:{startsWith:"https://"},waterMeasure:"CROP_ETC",waterRequirementMm:{not:null},isFullSeasonTotal:false},orderBy:{verifiedAt:"desc"},
   select:{sourceUrl:true,waterRequirementMm:true}}).catch(()=>null):null,
 ]);
 const input=savedProtection.safeParse(protection?.input).data;
 const findings=savedFindings.safeParse(protection?.findings).data;
 const photos=protection?.photos??[];
 const imageSigns=[...new Set(photos.flatMap(photo=>findings?.visionObservations?.[photo.id]?.visibleSymptoms??[]))];
 const samples=[
  {date:rainMoisture?.moistureMeasuredDate,amount:rainMoisture?.soilCurrentMoisturePercent},
  {date:irrigationMoisture?.completedAt,amount:irrigationMoisture?.soilMoisturePercent},
 ].filter(sample=>sample.date&&sample.amount!=null&&sample.amount.gte(0)&&sample.amount.lte(100))
  .sort((a,b)=>b.date!.getTime()-a.date!.getTime());
 const sample=samples[0];
 return {
  signs:input?.symptoms,imageSigns,suspectedIds:findings?.topSuspects?.map(suspect=>suspect.id),
  soilMoisture:input?.fieldHistory?.soilMoisture,observationDate:protection?dateOnly(protection.createdAt):undefined,
  photoReport:protection&&photos[0]?`/api/crop-protection/${encodeURIComponent(protection.id)}/photos/${encodeURIComponent(photos[0].id)}`:null,
  rainHistory:rain?.filter(row=>row.grossRainfallMm.gte(0)).map(row=>({value:`${row.grossRainfallMm} mm`,date:dateOnly(row.rainfallDate)})),
  irrigation:irrigation?.completedAt?{date:dateOnly(irrigation.completedAt),method:irrigation.method}:undefined,
  measuredMoisture:sample?{value:`${sample.amount}%`,date:dateOnly(sample.date!)}:null,
  cropWaterReference:water?.sourceUrl?{value:`${water.waterRequirementMm} mm`,source:water.sourceUrl}:null,
 };
}
