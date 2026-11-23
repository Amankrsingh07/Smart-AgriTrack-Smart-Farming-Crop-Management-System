import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { cropLossSchema,lossAllocationError,lossMetrics,lossAnalytics } from "@/lib/crop-loss";
import { calculateYieldPerAcre } from "@/lib/harvest";
export async function GET(){
 const user=await getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 try{
 const lots=await db.production.findMany({where:{cropCycle:{field:{farm:{userId:user.id}}}},include:{sales:true,lossAssessment:true,storageInspections:{orderBy:{version:"desc"},include:{attachments:{select:{id:true,filename:true}}}},cropCycle:{include:{crop:true,field:{include:{farm:true}}}}},orderBy:[{harvestDate:"desc"},{id:"desc"}]});
 const items=lots.map(lot=>{const assessment=lot.lossAssessment;const input=assessment?{harvested:lot.quantity.toString(),marketable:assessment.marketable.toString(),damaged:assessment.damaged.toString(),wasted:assessment.wasted.toString(),quantitiesConfirmed:assessment.quantitiesConfirmed&&assessment.harvestedSnapshot.eq(lot.quantity)&&assessment.unit===lot.unit,priceConfirmed:assessment.priceConfirmed,pricePerUnit:assessment.pricePerUnit?.toString()??null,damagedRecovery:assessment.damagedRecovery?.toString()??null,priceEvidence:assessment.priceEvidence}:null;
 return {id:lot.id,harvestedLotId:lot.id,cropCycleId:lot.cropCycleId,cropId:lot.cropCycle.cropId,farmId:lot.cropCycle.field.farmId,fieldId:lot.cropCycle.fieldId,crop:lot.cropCycle.crop.name,farmName:lot.cropCycle.field.farm.name,fieldName:lot.cropCycle.field.name,field:`${lot.cropCycle.field.farm.name} / ${lot.cropCycle.field.name}`,year:lot.harvestDate.getUTCFullYear().toString(),season:lot.cropCycle.season,stage:lot.cropCycle.growthStage,harvestDate:lot.harvestDate.toISOString().slice(0,10),harvested:lot.quantity.toString(),sold:lot.sales.reduce((sum,s)=>sum.add(s.quantity),new Prisma.Decimal(0)).toString(),unit:lot.unit,storageDetails:lot.storageDetails,storageInspections:lot.storageInspections,assessment,metrics:input?lossMetrics(input):null,metricInput:input};});
 return NextResponse.json({items,analytics:lossAnalytics(items.flatMap(item=>item.metricInput?[{year:item.year,season:item.season,crop:item.crop,cropKey:item.cropId,field:item.field,fieldKey:item.fieldId,unit:item.unit,metrics:item.metricInput}]:[])),scope:"Post-harvest allocations only. Unassessed lots and pre-harvest yield losses are not inferred."},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Loss records unavailable. Check the additive crop-loss migration."},{status:503});}
}
export async function POST(request:Request){
 const user=await getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 if(!checkRateLimit(`crop-loss:${user.id}`,20).allowed)return NextResponse.json({error:"Too many updates. Try later."},{status:429});
 const parsed=cropLossSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0].message},{status:400});
 const input=parsed.data;
 try{
 const result=await db.$transaction(async tx=>{
 const lot=await tx.production.findFirst({where:{id:input.harvestedLotId??input.productionId,...(input.cropCycleId?{cropCycleId:input.cropCycleId}:{}),cropCycle:{field:{farm:{userId:user.id}}}},include:{sales:true,lossAssessment:true,cropCycle:{include:{field:true}}}});
 if(!lot)return {error:"Harvest lot not found.",status:404};
 const harvested=new Prisma.Decimal(input.totalHarvested??lot.quantity.toString());
 if(harvested.lte(0))return {error:"Total harvested must be greater than zero.",status:400};
 const problem=lossAllocationError(input,{quantity:harvested.toString(),unit:lot.unit,harvestDate:lot.harvestDate.toISOString().slice(0,10),sales:lot.sales.map(s=>({quantity:s.quantity.toString(),unit:s.unit}))});
 if(problem)return {error:problem,status:400};
 if((lot.lossAssessment?.version??0)!==input.version)return {error:"This allocation changed. Reload before saving; duplicate submissions are not added.",status:409};
 const previous=lot.lossAssessment;
 const revisions=previous?[...(Array.isArray(previous.revisions)?previous.revisions:[]),JSON.parse(JSON.stringify({...previous,revisions:undefined}))]:[];
 if(!harvested.eq(lot.quantity)){
  const yieldPerAcre=calculateYieldPerAcre(harvested.toNumber(),lot.unit,Number(lot.cropCycle.field.area),lot.cropCycle.field.areaUnit);
  await tx.production.update({where:{id:lot.id},data:{quantity:harvested,yieldPerAcre}});
 }
 const data={assessedDate:new Date(`${input.assessedDate}T00:00:00Z`),marketable:input.marketable,damaged:input.damaged,wasted:input.wasted,unit:lot.unit,harvestedSnapshot:harvested,quantitiesConfirmed:true,evidence:input.evidence,pricePerUnit:input.pricePerUnit??null,damagedRecovery:input.damagedRecovery??null,priceEvidence:input.priceEvidence??null,priceConfirmed:input.priceConfirmed,cause:input.cause,notes:input.notes??null,revisions:revisions as Prisma.InputJsonValue};
 const saved=previous?await tx.cropLossAssessment.update({where:{id:previous.id},data:{...data,version:{increment:1}}}):await tx.cropLossAssessment.create({data:{...data,productionId:lot.id}});
 return {id:saved.id,harvestedLotId:lot.id,cropCycleId:lot.cropCycleId,version:saved.version,...lossMetrics({harvested:harvested.toString(),marketable:input.marketable,damaged:input.damaged,wasted:input.wasted,quantitiesConfirmed:true,priceConfirmed:input.priceConfirmed,pricePerUnit:input.pricePerUnit??null,damagedRecovery:input.damagedRecovery??null,priceEvidence:input.priceEvidence})};
 },{isolationLevel:"Serializable"});
 if("error"in result)return NextResponse.json({error:result.error},{status:result.status});return NextResponse.json(result);
 }catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&["P2034","P2002"].includes(error.code))return NextResponse.json({error:"Concurrent update. Refresh the lot and try again."},{status:409});return NextResponse.json({error:"Loss allocation could not be saved."},{status:503});}
}
