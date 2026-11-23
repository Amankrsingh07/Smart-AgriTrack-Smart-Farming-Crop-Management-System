import {db} from "./db";

export const lossReminderSelect = {
 id:true,title:true,message:true,cropName:true,productionId:true,dueOn:true,priority:true,actionId:true,completedAt:true,readAt:true,
} as const;

export function readLossReminders(userId:string) {
 return db.alert.findMany({
  where:{userId,dedupeKey:{startsWith:"loss:"},OR:[{readAt:null},{completedAt:{not:null}}]},
  select:lossReminderSelect,orderBy:[{completedAt:"asc"},{createdAt:"desc"}],take:100,
 });
}

export function inspectionReminderKey(cycleId:string,actionId:string,lotId?:string|null) {
 return `loss:${cycleId}:inspection:${actionId}:${actionId==="soil"?"next-crop":["weather","field-pests","field-disease","drainage"].includes(actionId)?"cycle":lotId??"cycle"}`;
}
