"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { isLanguageCode, languages } from "@/i18n/languages";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { clearSession, createSession, getUser } from "@/lib/session";
import { Prisma } from "@prisma/client";
import { canSellQuantity, saleRevenue } from "@/lib/finance";
import { irrigationMethods, irrigationSources } from "@/lib/farm-field-options";
import { cropGrowthStages as growthStages } from "@/lib/crop-growth-stages";
import { calculateYieldPerAcre } from "@/lib/harvest";
import { checkRateLimit } from "@/lib/rate-limit";
import { closeCropCycleSchedules, syncCalendarWhenCovered } from "@/lib/crop-calendar-service";
import { recordHarvestLot, validHarvestDate } from "@/lib/record-harvest";
import { deleteOwnedCropCycle } from "@/lib/delete-crop-cycle";

const authSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), email: z.email().max(190), password: z.string().min(8).max(100), phone: z.string().max(30).optional() });
function requireAuthConfiguration() {
  if (!process.env.DATABASE_URL) redirect("/?error=Database+is+not+configured.+Set+DATABASE_URL+in+.env.local+and+restart+the+server");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) redirect("/?error=Session+security+is+not+configured.+Set+a+32%2B+character+SESSION_SECRET+in+.env.local");
}
async function requestAddress() {
  const requestHeaders = await headers();
  return requestHeaders.get("x-real-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}
export async function signup(formData: FormData) {
  requireAuthConfiguration();
  const parsed = authSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !parsed.data.name) redirect("/?error=Check+your+details.+Password+must+be+8+characters+or+more");
  const { name, email, password, phone } = parsed.data;
  const address = await requestAddress();
  const signupIpRate = address ? checkRateLimit(`auth:signup:ip:${address}`, 5, 60 * 60_000) : { allowed: true };
  const signupEmailRate = checkRateLimit(`auth:signup:email:${email.toLowerCase()}`, 5, 60 * 60_000);
  if (!signupIpRate.allowed || !signupEmailRate.allowed) redirect("/?error=Too+many+signup+attempts.+Please+try+again+later");
  let existing: { id: string } | null;
  try { existing = await db.user.findUnique({ where: { email: email.toLowerCase() } }); } catch { redirect("/?error=Cannot+connect+to+the+database.+Check+DATABASE_URL+and+that+the+database+is+available"); }
  if (existing) redirect("/?error=An+account+with+that+email+already+exists");
  let user: Awaited<ReturnType<typeof db.user.create>>;
  const preferredLanguage = (await cookies()).get("agritrack_locale")?.value;
  try { user = await db.user.create({ data: { name, email: email.toLowerCase(), phone, language: preferredLanguage && isLanguageCode(preferredLanguage) ? preferredLanguage : "en", passwordHash: await bcrypt.hash(password, 12), profile: { create: {} } } }); } catch { redirect("/?error=Could+not+create+the+account.+Check+that+database+migrations+have+been+applied"); }
  await createSession(user.id); redirect("/dashboard");
}
export async function login(formData: FormData) {
  requireAuthConfiguration();
  const parsed = z.object({ email: z.email(), password: z.string().min(1).max(100) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/?error=Enter+a+valid+email+and+password");
  const address = await requestAddress();
  const loginIpRate = address ? checkRateLimit(`auth:login:ip:${address}`, 20, 15 * 60_000) : { allowed: true };
  const loginEmailRate = checkRateLimit(`auth:login:email:${parsed.data.email.toLowerCase()}`, 10, 15 * 60_000);
  if (!loginIpRate.allowed || !loginEmailRate.allowed) redirect("/?error=Too+many+login+attempts.+Please+wait+before+trying+again");
  let user: Awaited<ReturnType<typeof db.user.findUnique>>;
  try { user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } }); } catch { redirect("/?error=Cannot+connect+to+the+database.+Check+DATABASE_URL+and+that+the+database+is+available"); }
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) redirect("/?error=Email+or+password+is+incorrect");
  const preferredLanguage = (await cookies()).get("agritrack_locale")?.value;
  if (preferredLanguage && isLanguageCode(preferredLanguage) && user.language !== preferredLanguage) await db.user.update({ where: { id: user.id }, data: { language: preferredLanguage } });
  await createSession(user.id); redirect("/dashboard");
}
export async function logout() { await clearSession(); redirect("/"); }
export async function addFarm(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const parsed = z.object({ name:z.string().trim().min(1).max(100), state:z.string().trim().min(1).max(100), district:z.string().trim().min(1).max(100), village:z.string().max(100).optional(), latitude:z.preprocess(v=>v===""?undefined:v,z.coerce.number().min(-90).max(90).optional()), longitude:z.preprocess(v=>v===""?undefined:v,z.coerce.number().min(-180).max(180).optional()), description:z.string().max(1000).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/farms?error=Please+complete+the+required+fields");
  await db.farm.create({ data: { ...parsed.data, userId: user.id } }); redirect("/farms?saved=Farm+added");
}
export async function updateFarm(formData: FormData) {
  const user=await getUser();if(!user)redirect("/");
  const coordinate=z.preprocess(v=>v===""?null:v,z.union([z.coerce.number(),z.null()]));
  const parsed=z.object({id:z.string().min(1),name:z.string().trim().min(1).max(100),state:z.string().trim().min(1).max(100),district:z.string().trim().min(1).max(100),village:z.string().max(100).optional(),latitude:coordinate.refine(v=>v===null||(v>=-90&&v<=90)),longitude:coordinate.refine(v=>v===null||(v>=-180&&v<=180)),description:z.string().max(1000).optional()}).safeParse(Object.fromEntries(formData));
  if(!parsed.success)redirect("/farms?error=Please+check+the+farm+details");
  const {id,...data}=parsed.data;const result=await db.farm.updateMany({where:{id,userId:user.id},data});if(!result.count)redirect("/farms?error=Farm+not+found");redirect("/farms?saved=Farm+updated");
}
export async function deleteFarm(formData: FormData) {
  const user=await getUser();if(!user)redirect("/");const id=String(formData.get("id")||"");
  if (!id) redirect("/farms?error=Farm+not+found");
  const result = await db.farm.deleteMany({ where: { id, userId: user.id } }).catch(error => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirect("/farms?error=This+farm+has+linked+records+that+must+be+preserved");
    }
    throw error;
  });
  if (!result.count) redirect("/farms?error=Farm+not+found");
  redirect("/farms?saved=Farm+and+its+related+records+deleted");
}
export async function addField(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const parsed = z.object({ farmId:z.string().min(1), name:z.string().trim().min(1).max(100), area:z.coerce.number().positive().max(100000), areaUnit:z.enum(["acre","hectare"]), soilType:z.string().min(1).max(100), soilTexture:z.preprocess(value => value === "" ? undefined : value,z.enum(["Sandy","Loamy","Clayey"]).optional()), irrigationMethod:z.enum(irrigationMethods), irrigationSource:z.enum(irrigationSources), waterAvailability:z.enum(["LOW","MEDIUM","HIGH"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/farms?error=Check+field+details");
  const farm = await db.farm.findFirst({ where: { id: parsed.data.farmId, userId: user.id }, select: { id: true } }); if (!farm) redirect("/farms?error=Farm+not+found");
  await db.field.create({ data: { ...parsed.data, farmId: farm.id } }); redirect("/farms?saved=Field+added");
}
function cropSaveError(error: unknown) {
  return error instanceof Error && !(error instanceof Prisma.PrismaClientKnownRequestError) && !(error instanceof Prisma.PrismaClientUnknownRequestError)
    ? error.message : "Could not save the crop cycle and its calendar. Refresh and try again.";
}

export async function addCropCycle(formData: FormData) {
  const user=await getUser();if(!user)redirect("/");
  const optionalDate=z.preprocess(value => value === "" ? undefined : value, z.iso.date().transform(value => new Date(value)).optional());
  const durationDays = z.preprocess(value => value === "" || value === undefined ? null : value, z.union([z.null(), z.coerce.number().int().min(1).max(730)]));
  const parsed=z.object({fieldId:z.string().min(1),cropId:z.string().optional(),newCropName:z.string().trim().max(80).optional(),cropVariety:z.string().trim().max(120).optional(),season:z.enum(["KHARIF","RABI","ZAID"]),sowingDate:optionalDate,expectedHarvestDate:optionalDate,cropDurationDays:durationDays,growthStage:z.preprocess(value=>value===""?undefined:value,z.enum(growthStages).optional()),status:z.enum(["PLANNED","ACTIVE"]).default("PLANNED"),notes:z.string().max(1000).optional()}).safeParse(Object.fromEntries(formData));
  if(!parsed.success)redirect("/crops?error=Check+crop+cycle+details");
  if (parsed.data.sowingDate && parsed.data.expectedHarvestDate && parsed.data.expectedHarvestDate <= parsed.data.sowingDate) redirect("/crops?error=Expected+harvest+date+must+be+after+sowing");
  let cropId=parsed.data.cropId;
  if(cropId==="__new__"){
    const name=parsed.data.newCropName?.trim();if(!name||name.length<2)redirect("/crops?error=Enter+a+crop+name+of+at+least+2+characters");
    try { const existing=await db.crop.findUnique({where:{name},select:{id:true}});const crop=existing??await db.crop.create({data:{name,seasons:"KHARIF,RABI,ZAID",soilTypes:"General",waterNeed:"MEDIUM",illustrative:false}}); cropId=crop.id; }
    catch { redirect("/crops?error=That+crop+already+exists+or+could+not+be+saved"); }
  }
  if(!cropId)redirect("/crops?error=Choose+a+crop");
  const field=await db.field.findFirst({where:{id:parsed.data.fieldId,farm:{userId:user.id}},select:{id:true}});if(!field)redirect("/crops?error=Field+not+found");
  const crop=await db.crop.findUnique({where:{id:cropId},select:{id:true,climateRequirement:{select:{cropDurationDays:true}}}});if(!crop)redirect("/crops?error=Crop+not+found");
  const {fieldId: _fieldId,cropId: _cropId,newCropName: _newCropName,...cycleData}=parsed.data;
  void _fieldId; void _cropId; void _newCropName;
  const resolvedDuration = cycleData.cropDurationDays ?? crop.climateRequirement?.cropDurationDays ?? null;
  const growthStageUpdatedAt = cycleData.growthStage ? new Date() : null;
  try {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Field WHERE id = ${field.id} FOR UPDATE`;
      const duplicate = await tx.cropCycle.findFirst({ where: { fieldId: field.id, cropId: crop.id, season: cycleData.season, status: { in: ["PLANNED", "ACTIVE"] } }, select: { id: true } });
      if (duplicate) throw new Error("This crop is already planned or active in that field and season.");
      const created = await tx.cropCycle.create({ data: { ...cycleData, cropDurationDays: resolvedDuration, growthStageUpdatedAt, fieldId: field.id, cropId: crop.id } });
      if (created.sowingDate) await syncCalendarWhenCovered(user.id, created.id, tx);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    redirect(`/crops?error=${encodeURIComponent(cropSaveError(error))}`);
  }
  redirect("/crops?saved=Crop+cycle+created");
}
export async function updateCropCycle(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const optionalDate = z.preprocess(value => value === "" ? null : value, z.union([z.null(), z.iso.date().transform(value => new Date(value))]));
  const durationDays = z.preprocess(value => value === "" ? null : value, z.union([z.null(), z.coerce.number().int().min(1).max(730)]));
  const parsed = z.object({
    id: z.string().min(1), fieldId: z.string().min(1), cropId: z.string().min(1), cropVariety: z.string().trim().max(120).optional(),
    season: z.enum(["KHARIF", "RABI", "ZAID"]),
    status: z.enum(["PLANNED", "ACTIVE", "HARVESTED", "COMPLETED"]),
    sowingDate: optionalDate, expectedHarvestDate: optionalDate, cropDurationDays: durationDays, growthStage: z.preprocess(value => value === "" ? undefined : value, z.enum(growthStages).optional()), notes: z.string().max(1000),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/crops?error=Check+crop+cycle+details");
  const { id, fieldId, cropId, ...data } = parsed.data;
  if (data.sowingDate && data.expectedHarvestDate && data.expectedHarvestDate <= data.sowingDate) redirect("/crops?error=Expected+harvest+date+must+be+after+sowing");
  const cycle = await db.cropCycle.findFirst({ where: { id, field: { farm: { userId: user.id } } }, select: { id: true, status: true, actualHarvestDate: true, growthStage: true, growthStageUpdatedAt: true } });
  if (!cycle) redirect("/crops?error=Crop+cycle+not+found");
  if (data.status === "HARVESTED" && cycle.status !== "HARVESTED" && !cycle.actualHarvestDate) redirect("/crops?error=Confirm+harvesting+with+the+Mark+as+Harvested+button");
  const field = await db.field.findFirst({ where: { id: fieldId, farm: { userId: user.id } }, select: { id: true } });
  if (!field) redirect("/crops?error=Field+not+found");
  const crop = await db.crop.findUnique({ where: { id: cropId }, select: { id: true, climateRequirement: { select: { cropDurationDays: true } } } });
  if (!crop) redirect("/crops?error=Crop+not+found");
  try {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Field WHERE id = ${field.id} FOR UPDATE`;
      const current = await tx.cropCycle.findFirst({ where: { id, field: { farm: { userId: user.id } } } });
      if (!current) throw new Error("Crop cycle not found.");
      if (current.actualHarvestDate && ["PLANNED", "ACTIVE"].includes(data.status)) throw new Error("A harvested crop cycle cannot be reopened here.");
      if (["PLANNED", "ACTIVE"].includes(data.status)) {
        const duplicate = await tx.cropCycle.findFirst({ where: { id: { not: id }, fieldId, cropId, season: data.season, status: { in: ["PLANNED", "ACTIVE"] } }, select: { id: true } });
        if (duplicate) throw new Error("This crop is already planned or active in that field and season.");
      }
      const growthStage = data.growthStage ?? current.growthStage;
      const growthStageUpdatedAt = growthStage === current.growthStage ? current.growthStageUpdatedAt : new Date();
      await tx.cropCycle.update({ where: { id }, data: { ...data, growthStage, cropDurationDays: data.cropDurationDays ?? crop.climateRequirement?.cropDurationDays ?? null, growthStageUpdatedAt, fieldId, cropId } });
      if (current.actualHarvestDate || ["HARVESTED", "COMPLETED"].includes(data.status)) {
        await closeCropCycleSchedules(user.id, id, data.status, tx);
      } else if (data.sowingDate) {
        await syncCalendarWhenCovered(user.id, id, tx);
      } else if (current.sowingDate && await tx.cropCalendar.count({ where: { cropCycleId: id } })) {
        throw new Error("Keep a sowing date for a crop cycle with a calendar.");
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    redirect(`/crops?error=${encodeURIComponent(cropSaveError(error))}`);
  }
  redirect("/crops?saved=Crop+cycle+updated");
}

export async function markCropCycleHarvested(formData: FormData) {
  const user = await getUser();
  if (!user) redirect("/");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/crops?error=Crop+cycle+not+found");
  const cycle = await db.cropCycle.findFirst({ where: { id, field: { farm: { userId: user.id } }, actualHarvestDate: null }, select: { id: true } });
  if (!cycle) redirect("/crops?error=Crop+cycle+not+found");
  redirect(`/harvests?cropCycleId=${encodeURIComponent(cycle.id)}`);
}
export async function deleteCropCycle(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/crops?error=Crop+cycle+not+found");
  let deleted = false;
  try {
    deleted = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM CropCycle WHERE id = ${id} FOR UPDATE`;
      return deleteOwnedCropCycle(tx, user.id, id);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      const constraint = typeof error.meta?.field_name === "string" ? error.meta.field_name : "a related record";
      redirect(`/crops?error=${encodeURIComponent(`Deletion blocked by retained linked record (${constraint}). No records were deleted.`)}`);
    }
    redirect("/crops?error=Crop+cycle+deletion+failed.+No+records+were+deleted");
  }
  if (!deleted) redirect("/crops?error=Crop+cycle+not+found");
  for (const path of ["/crops", "/dashboard", "/reports", "/expenses", "/production", "/harvests", "/inventory", "/crop-calendar", "/recommendations", "/fertilizer-recommendation", "/crop-loss"]) revalidatePath(path);
  redirect("/crops?saved=Crop+cycle+deleted");
}
export async function addCropCalendarEvent(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const parsed = z.object({
    title: z.string().trim().min(2).max(120),
    eventDate: z.string().date(),
    cropCycleId: z.string().optional(),
    notes: z.string().max(500).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/crops?error=Check+calendar+event+details");
  const { title, eventDate, cropCycleId, notes } = parsed.data;
  if (cropCycleId) {
    const cycle = await db.cropCycle.findFirst({ where: { id: cropCycleId, field: { farm: { userId: user.id } } }, select: { id: true } });
    if (!cycle) redirect("/crops?error=Crop+cycle+not+found");
  }
  await db.cropCalendarEvent.create({ data: {
    userId: user.id,
    cropCycleId: cropCycleId || null,
    title,
    eventDate: new Date(`${eventDate}T00:00:00.000Z`),
    notes: notes || null,
  } });
  revalidatePath("/crops");
  redirect("/crops?saved=Calendar+event+added");
}
export async function deleteCropCalendarEvent(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/crops?error=Calendar+event+not+found");
  const result = await db.cropCalendarEvent.deleteMany({ where: { id, userId: user.id } });
  if (!result.count) redirect("/crops?error=Calendar+event+not+found");
  revalidatePath("/crops");
  redirect("/crops?saved=Calendar+event+deleted");
}
export async function addExpense(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const parsed = z.object({ farmId:z.string().min(1), category:z.enum(["SEEDS","FERTILIZER","PESTICIDES","LABOR","IRRIGATION","MACHINERY","TRANSPORTATION","OTHER"]), amount:z.string().regex(/^\d{1,9}(\.\d{1,2})?$/), date:z.coerce.date(), description:z.string().max(500).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/expenses?error=Check+expense+details");
  const farm = await db.farm.findFirst({ where:{id:parsed.data.farmId,userId:user.id},select:{id:true} }); if (!farm) redirect("/expenses?error=Farm+not+found");
  await db.expense.create({ data:{...parsed.data,amount:new Prisma.Decimal(parsed.data.amount),userId:user.id} }); revalidatePath("/dashboard"); redirect("/expenses?saved=Expense+recorded");
}
export async function updateExpense(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const parsed = z.object({ id:z.string().min(1), farmId:z.string().min(1), category:z.enum(["SEEDS","FERTILIZER","PESTICIDES","LABOR","IRRIGATION","MACHINERY","TRANSPORTATION","OTHER"]), amount:z.string().regex(/^\d{1,9}(\.\d{1,2})?$/), date:z.coerce.date(), description:z.string().max(500).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || Number(parsed.data.amount) <= 0) redirect("/expenses?error=Check+expense+details");
  const farm = await db.farm.findFirst({ where:{id:parsed.data.farmId,userId:user.id},select:{id:true} });
  if (!farm) redirect("/expenses?error=Farm+not+found");
  const { id, amount, description, ...data } = parsed.data;
  const result = await db.expense.updateMany({ where:{id,userId:user.id},data:{...data,amount:new Prisma.Decimal(amount),description:description||null} });
  if (!result.count) redirect("/expenses?error=Expense+record+not+found");
  revalidatePath("/dashboard");
  redirect("/expenses?saved=Expense+updated");
}
export async function deleteExpense(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/expenses?error=Expense+record+not+found");
  const result = await db.expense.deleteMany({ where:{id,userId:user.id} });
  if (!result.count) redirect("/expenses?error=Expense+record+not+found");
  revalidatePath("/dashboard");
  redirect("/expenses?saved=Expense+deleted");
}
export async function addProduction(formData:FormData){
  const user=await getUser();if(!user)redirect("/");
  const parsed=z.object({cropCycleId:z.string().min(1),harvestDate:z.iso.date(),quantity:z.coerce.number().min(0.001).max(999999999),unit:z.string().trim().min(1).max(24),grade:z.string().max(80).optional(),notes:z.string().max(1000).optional()}).safeParse(Object.fromEntries(formData));
  if(!parsed.success)redirect("/production?error=Check+harvest+details");
  if (!validHarvestDate(parsed.data.harvestDate)) redirect("/production?error=Enter+a+valid+harvest+date+that+is+not+in+the+future");
  const result = await recordHarvestLot(user.id, parsed.data, "production");
  if (result.status === "missing") redirect("/production?error=Crop+cycle+not+found");
  if (result.status !== "saved") redirect("/production?error=A+harvest+lot+with+this+date+and+quantity+is+already+recorded");
  redirect("/production?saved=Harvest+recorded");
}
export async function saveInventoryThreshold(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const parsed = z.object({ cropName: z.string().trim().min(1).max(100), unit: z.string().trim().min(1).max(24), lowStock: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/), highStock: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || Number(parsed.data.lowStock) >= Number(parsed.data.highStock)) redirect("/inventory?error=Low+stock+must+be+less+than+high+stock");
  await db.inventoryThreshold.upsert({ where: { userId_cropName_unit: { userId: user.id, cropName: parsed.data.cropName, unit: parsed.data.unit } }, create: { userId: user.id, ...parsed.data, lowStock: new Prisma.Decimal(parsed.data.lowStock), highStock: new Prisma.Decimal(parsed.data.highStock) }, update: { lowStock: new Prisma.Decimal(parsed.data.lowStock), highStock: new Prisma.Decimal(parsed.data.highStock) } });
  redirect("/inventory?saved=Stock+thresholds+saved");
}
export async function updateProduction(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const parsed = z.object({ id: z.string().min(1), harvestDate: z.coerce.date(), quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/), grade: z.string().max(80).optional(), notes: z.string().max(1000).optional(), storageDetails: z.string().max(1000).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || Number(parsed.data.quantity) <= 0) redirect("/production?error=Check+harvest+details");
  const outcome = await db.$transaction(async tx => {
    const record = await tx.production.findFirst({ where: { id: parsed.data.id, cropCycle: { field: { farm: { userId: user.id } } } }, include: { sales: true, lossAssessment: true, storageInspections:{orderBy:{inspectedOn:"asc"},take:1,select:{inspectedOn:true}}, cropCycle: { select: { fieldId: true } } } });
    if (!record) return "Harvest record not found.";
    if (record.lossAssessment && (!record.quantity.eq(parsed.data.quantity) || record.harvestDate.getTime() !== parsed.data.harvestDate.getTime())) return "This harvest has a loss allocation. Its quantity/date are locked to preserve the allocation audit; notes and storage details can still be edited.";
    if (record.storageInspections[0] && parsed.data.harvestDate > record.storageInspections[0].inspectedOn) return "Harvest date cannot follow a saved storage inspection.";
    const sold = record.sales.reduce((sum, sale) => sum.add(sale.quantity), new Prisma.Decimal(0));
    if (new Prisma.Decimal(parsed.data.quantity).lt(sold)) return "Harvest quantity cannot be less than recorded sales.";
    const field = await tx.field.findUnique({ where: { id: record.cropCycle.fieldId }, select: { area: true, areaUnit: true } });
    const calculatedYield = field ? calculateYieldPerAcre(Number(parsed.data.quantity), record.unit, Number(field.area), field.areaUnit) : null;
    await tx.production.update({ where: { id: record.id }, data: { harvestDate: parsed.data.harvestDate, quantity: new Prisma.Decimal(parsed.data.quantity), grade: parsed.data.grade || null, notes: parsed.data.notes || null, storageDetails: parsed.data.storageDetails || null, yieldPerAcre: calculatedYield } });
    return null;
  }, { isolationLevel: "Serializable" }).catch(error => { if (error && typeof error === "object" && "code" in error && error.code === "P2034") return "Harvest changed concurrently. Refresh and retry."; throw error; });
  if (outcome) redirect(`/production?error=${encodeURIComponent(outcome)}`);
  redirect("/production?saved=Harvest+updated");
}
export async function deleteProduction(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const id = String(formData.get("id") || "");
  const record = await db.production.findFirst({ where: { id, cropCycle: { field: { farm: { userId: user.id } } } }, include: { lossAssessment: { select: { id: true } }, storageInspections:{take:1,select:{version:true}} } });
  if (!record) redirect(`/production?error=${encodeURIComponent("Harvest record not found.")}`);
  if (record.lossAssessment) redirect(`/production?error=${encodeURIComponent("This harvest has a preserved loss allocation and cannot be deleted.")}`);
  if (record.storageInspections.length) redirect("/production?error=Linked+storage+inspection+prevents+deletion");
  try { await db.production.delete({ where: { id: record.id } }); } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2003") redirect("/production?error=Linked+loss+allocation+prevents+deletion"); throw error; }
  revalidatePath("/production");
  revalidatePath("/dashboard");
  redirect("/production?saved=Harvest+deleted");
}
export async function addSale(formData:FormData){
  const user=await getUser();if(!user)redirect("/");
  const parsed=z.object({productionId:z.string().min(1),saleDate:z.coerce.date(),quantity:z.string().regex(/^\d{1,9}(\.\d{1,3})?$/),pricePerUnit:z.string().regex(/^\d{1,9}(\.\d{1,2})?$/),buyerName:z.string().max(120).optional(),notes:z.string().max(1000).optional()}).safeParse(Object.fromEntries(formData));
  if(!parsed.success || Number(parsed.data.quantity) <= 0 || Number(parsed.data.pricePerUnit) <= 0)redirect("/production?error=Check+sale+details");
  let outcome: "saved" | "missing" | "exceeds";
  try {
    outcome = await db.$transaction(async tx => {
      const production=await tx.production.findFirst({where:{id:parsed.data.productionId,cropCycle:{field:{farm:{userId:user.id}}}},include:{sales:true,lossAssessment:true}});
      if(!production)return "missing";
      const quantity=new Prisma.Decimal(parsed.data.quantity);
      if(!canSellQuantity(new Prisma.Decimal(production.lossAssessment?.marketable ?? production.quantity),production.sales.map(s=>new Prisma.Decimal(s.quantity)),quantity))return "exceeds";
      const totalRevenue=saleRevenue(parsed.data.quantity,parsed.data.pricePerUnit);
      await tx.sale.create({data:{...parsed.data,quantity,cropCycleId:production.cropCycleId,productionId:production.id,unit:production.unit,totalRevenue}});
      return "saved";
    },{isolationLevel:"Serializable"});
  } catch (error) {
    if(error&&typeof error==="object"&&"code" in error&&error.code==="P2034")redirect("/production?error=Stock+changed+while+recording+the+sale.+Please+refresh+and+try+again");
    throw error;
  }
  if(outcome==="missing")redirect("/production?error=Harvest+record+not+found");
  if(outcome==="exceeds")redirect("/production?error=Sale+quantity+exceeds+available+harvest");
  revalidatePath("/dashboard"); redirect("/production?saved=Sale+recorded");
}
export async function updateSale(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const parsed = z.object({ id: z.string().min(1), saleDate: z.coerce.date(), quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/), pricePerUnit: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/), buyerName: z.string().max(120).optional(), notes: z.string().max(1000).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || Number(parsed.data.quantity) <= 0 || Number(parsed.data.pricePerUnit) <= 0) redirect("/production?error=Check+sale+details");
  let outcome: "saved" | "missing" | "exceeds";
  try {
    outcome = await db.$transaction(async tx => {
      const sale = await tx.sale.findFirst({ where: { id: parsed.data.id, cropCycle: { field: { farm: { userId: user.id } } } }, include: { production: { include: { sales: true, lossAssessment: true } } } });
      if (!sale?.production) return "missing";
      const quantity = new Prisma.Decimal(parsed.data.quantity);
      const remaining = sale.production.sales.filter(row => row.id !== sale.id).map(row => new Prisma.Decimal(row.quantity));
      if (!canSellQuantity(new Prisma.Decimal(sale.production.lossAssessment?.marketable ?? sale.production.quantity), remaining, quantity)) return "exceeds";
      const totalRevenue = saleRevenue(parsed.data.quantity, parsed.data.pricePerUnit);
      await tx.sale.update({ where: { id: sale.id }, data: { saleDate: parsed.data.saleDate, quantity, pricePerUnit: new Prisma.Decimal(parsed.data.pricePerUnit), totalRevenue, buyerName: parsed.data.buyerName || null, notes: parsed.data.notes || null } });
      return "saved";
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") redirect("/production?error=Stock+changed+while+updating+the+sale.+Please+refresh+and+try+again");
    throw error;
  }
  if (outcome === "missing") redirect("/production?error=Sale+record+not+found");
  if (outcome === "exceeds") redirect("/production?error=Sale+quantity+exceeds+available+harvest");
  revalidatePath("/dashboard"); redirect("/production?saved=Sale+updated");
}
export async function deleteSale(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const id = String(formData.get("id") || "");
  const result = await db.sale.deleteMany({ where: { id, cropCycle: { field: { farm: { userId: user.id } } } } });
  if (!result.count) redirect("/production?error=Sale+record+not+found");
  revalidatePath("/dashboard");
  redirect("/production?saved=Sale+deleted");
}
export async function addMarketQuote(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const parsed = z.object({ crop: z.string().trim().min(1).max(80), mandi: z.string().trim().min(1).max(120), price: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/), unit: z.enum(["kg", "quintal"]), quoteDate: z.coerce.date() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || Number(parsed.data.price) <= 0) redirect("/market?error=Check+the+quote+details+and+enter+a+positive+price");
  await db.marketQuote.create({ data: { ...parsed.data, price: new Prisma.Decimal(parsed.data.price), userId: user.id } });
  redirect("/market?saved=Manual+price+quote+saved");
}
export async function deleteMarketQuote(formData: FormData) {
  const user = await getUser(); if (!user) redirect("/");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/market?error=Quote+not+found");
  const result = await db.marketQuote.deleteMany({ where: { id, userId: user.id } });
  if (!result.count) redirect("/market?error=Quote+not+found");
  redirect("/market?saved=Quote+deleted");
}
export async function updateProfile(formData:FormData){
  const user=await getUser();if(!user)redirect("/");
  const parsed=z.object({name:z.string().trim().min(2).max(80),phone:z.string().max(30).optional(),state:z.string().max(100).optional(),district:z.string().max(100).optional(),village:z.string().max(100).optional(),language:z.enum(languages.map(item=>item.code) as [string,...string[]]).default(isLanguageCode(user.language) ? user.language : "en"),preferredSeason:z.preprocess(v=>v===""?undefined:v,z.enum(["KHARIF","RABI","ZAID"]).optional())}).safeParse(Object.fromEntries(formData));
  if(!parsed.success)redirect("/profile?error=Please+check+your+profile+details");
  const {name,phone,state,district,village,preferredSeason,language}=parsed.data;
  await db.$transaction([db.user.update({where:{id:user.id},data:{name,phone:phone||null,language}}),db.farmerProfile.upsert({where:{userId:user.id},create:{userId:user.id,state:state||null,district:district||null,village:village||null,preferredSeason},update:{state:state||null,district:district||null,village:village||null,preferredSeason:preferredSeason||null}})]);
  (await cookies()).set("agritrack_locale",language,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*365});
  redirect("/profile?saved=Profile+updated");
}
