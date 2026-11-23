import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
export async function PATCH(request:Request){const user=await getUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});const input=z.object({id:z.string().min(1).max(191)}).safeParse(await request.json().catch(()=>null));if(!input.success)return NextResponse.json({error:"Select a reminder."},{status:400});try{const result=await db.alert.updateMany({where:{id:input.data.id,userId:user.id,completedAt:null,dedupeKey:{startsWith:"loss:"}},data:{readAt:new Date(),completedAt:new Date()}});return result.count?NextResponse.json({ok:true}):NextResponse.json({error:"Reminder not found."},{status:404});}catch{return NextResponse.json({error:"Reminder unavailable."},{status:503});}}
