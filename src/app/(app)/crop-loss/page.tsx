import {getLocale} from "next-intl/server";
import {workspaceCatalog} from "@/i18n/crop-protection";
import {ProtectionCatalogProvider} from "@/i18n/crop-protection/client";
import {readLossReminders} from "@/lib/crop-loss-reminders";
import {db} from "@/lib/db";
import {getUser} from "@/lib/session";
import LossWorkspace from "./ui";
export default async function CropLoss({searchParams}:{searchParams:Promise<{cycle?:string;lot?:string}>}){
 const user=await getUser();if(!user)return null;const params=await searchParams;
 const cycles=await db.cropCycle.findMany({where:{field:{farm:{userId:user.id}}},include:{crop:true,field:true,cropCalendar:{select:{activities:{select:{id:true,status:true,activityType:true,activityName:true}}}}},orderBy:{createdAt:"desc"},take:200});
 const reminders=JSON.parse(JSON.stringify(await readLossReminders(user.id)));
 const allFollowUps=await db.alert.findMany({where:{userId:user.id,dedupeKey:{startsWith:"loss:"}},select:{dedupeKey:true,completedAt:true}});
 const followUpsByCycle=new Map<string,{total:number;completed:number}>();
 for(const row of allFollowUps){const match=row.dedupeKey?.match(/^loss:([^:]+):/);if(!match)continue;const entry=followUpsByCycle.get(match[1])??{total:0,completed:0};entry.total++;if(row.completedAt)entry.completed++;followUpsByCycle.set(match[1],entry);}
 const locale = await getLocale();
 const catalog = locale === "en" ? undefined : workspaceCatalog(locale);
 return <ProtectionCatalogProvider value={catalog}><LossWorkspace cycles={cycles.map(c=>{const followUps=followUpsByCycle.get(c.id)??{total:0,completed:0};const preventionActivities=c.cropCalendar?.activities.filter(a=>["PEST_MONITORING","PROTECTION_REVIEW"].includes(a.activityType)||/inspect|scout|prevent|protect|monitor|pest|disease/i.test(a.activityName))??[];return {id:c.id,label:`${c.crop.name} — ${c.field.name}`,crop:c.crop.name,stage:c.growthStage,soilType:c.field.soilType,soilTexture:c.field.soilTexture,expectedHarvestQuantity:c.expectedHarvestQuantity?.toString()??null,expectedHarvestUnit:c.expectedHarvestUnit,activitiesTotal:preventionActivities.length,activitiesCompleted:preventionActivities.filter(a=>a.status==="COMPLETED").length,followUpsTotal:followUps.total,followUpsCompleted:followUps.completed};})} initialCycle={params.cycle??""} initialLot={params.lot??""} initialReminders={reminders}/></ProtectionCatalogProvider>;
}
