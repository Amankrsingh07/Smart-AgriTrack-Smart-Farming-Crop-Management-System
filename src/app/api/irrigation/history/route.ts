import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { isSameWateringTransaction, wateringRecordIdentity } from "@/lib/watering-record";

const litersSchema = z.number().positive().max(100_000_000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Water amount supports at most two decimal places.");
const recordSchema = z.object({ transactionId:z.string().uuid(), cropCycleId:z.string().min(1), irrigationDate:z.string().date(), waterAppliedLiters:litersSchema, method:z.enum(["Drip Irrigation","Sprinkler Irrigation","Surface/Flood Irrigation","Furrow"]), durationMinutes:z.number().int().positive().max(1440).optional(), notes:z.string().max(500).optional() });
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getUser(); if (!user) return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  const data = await db.irrigationSchedule.findMany({where:{userId:user.id},select:{id:true,cropCycleId:true,scheduledAt:true,actualQuantityLiters:true,irrigationDepthMm:true,method:true,durationMinutes:true,notes:true,status:true,isCheckOnly:true,cropCycle:{select:{crop:{select:{name:true}},field:{select:{name:true}}}}},orderBy:{scheduledAt:"desc"}});
  return NextResponse.json({success:true,data:data.map(row=>({id:row.id,cropCycleId:row.cropCycleId,crop:row.cropCycle.crop.name,field:row.cropCycle.field.name,date:row.scheduledAt.toISOString().slice(0,10),waterAppliedLiters:row.actualQuantityLiters===null?null:Number(row.actualQuantityLiters),waterAppliedMm:row.irrigationDepthMm===null?null:Number(row.irrigationDepthMm),method:row.method,durationMinutes:row.durationMinutes,notes:row.notes,status:row.status,isCheckOnly:row.isCheckOnly}))});
}
export async function POST(request:Request) {
  const user = await getUser(); if (!user) return NextResponse.json({success:false,error:"Authentication required."},{status:401});
  let body:unknown; try {body=await request.json();} catch {return NextResponse.json({success:false,error:"Invalid JSON body."},{status:400});}
  const parsed=recordSchema.safeParse(body); if(!parsed.success) return NextResponse.json({success:false,error:"Check the irrigation record fields. Enter actual water volume in litres."},{status:400});
  const cycle=await db.cropCycle.findFirst({where:{id:parsed.data.cropCycleId,field:{farm:{userId:user.id}}},select:{id:true}}); if(!cycle) return NextResponse.json({success:false,error:"Crop cycle not found."},{status:404});
  const todayIndia = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if(parsed.data.irrigationDate > todayIndia) return NextResponse.json({success:false,error:"Irrigation date cannot be in the future."},{status:400});
  const entry = wateringRecordIdentity(parsed.data);
  const date=new Date(`${entry.irrigationDate}T12:00:00.000Z`);
  try {
    const row = await db.$transaction(async tx => {
      const existing = await tx.irrigationSchedule.findUnique({ where: { clientTransactionId: parsed.data.transactionId } });
      if (existing) {
        const sameSubmission = isSameWateringTransaction({ ...existing, actualQuantityLiters: existing.actualQuantityLiters === null ? null : Number(existing.actualQuantityLiters) }, { ...parsed.data, userId: user.id, cropCycleId: cycle.id });
        return sameSubmission ? { id: existing.id, duplicate: true, conflict: false } : { id: existing.id, duplicate: false, conflict: true };
      }
      const created = await tx.irrigationSchedule.create({data:{clientTransactionId:parsed.data.transactionId,userId:user.id,cropCycleId:cycle.id,scheduledAt:date,completedAt:date,status:"COMPLETED",actualQuantityLiters:new Prisma.Decimal(entry.waterAppliedLiters),actualQuantityUnit:"L",irrigationDepthMm:null,durationMinutes:parsed.data.durationMinutes??null,method:entry.method,irrigationSource:"FARMER_RECORDED",notes:entry.notes},select:{id:true}});
      return { id: created.id, duplicate: false, conflict: false };
    }, { isolationLevel: "Serializable" });
    if (row.conflict) return NextResponse.json({success:false,error:"This transaction ID was already used for a different watering entry."},{status:409});
    return NextResponse.json({success:true,id:row.id,duplicate:row.duplicate},{status:row.duplicate?200:201});
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const existing = await db.irrigationSchedule.findUnique({ where: { clientTransactionId: parsed.data.transactionId } });
      if (existing && isSameWateringTransaction({ ...existing, actualQuantityLiters: existing.actualQuantityLiters === null ? null : Number(existing.actualQuantityLiters) }, { ...parsed.data, userId: user.id, cropCycleId: cycle.id })) return NextResponse.json({success:true,id:existing.id,duplicate:true},{status:200});
      return NextResponse.json({success:false,error:"This transaction ID was already used for another watering entry."},{status:409});
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return NextResponse.json({success:false,error:"A matching watering record was saved concurrently. Refresh irrigation history."},{status:409});
    throw error;
  }
}
