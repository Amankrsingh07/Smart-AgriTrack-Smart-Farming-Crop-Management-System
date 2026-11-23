import {test,expect,type APIRequestContext} from "@playwright/test";
import {PrismaClient} from "@prisma/client";
import {hash} from "bcryptjs";
import {createHmac,randomUUID} from "node:crypto";
import {requireTestDatabase} from "../src/lib/test-database-safety";
const db=new PrismaClient({datasourceUrl:requireTestDatabase(process.env.TEST_DATABASE_URL)});
const secret="isolated-soil-tests-only-32-characters-minimum";
const tag=randomUUID();const password="LossTestPassword123!";
let owner:string,other:string,cropId:string,cycleId:string,lotId:string,foreignLotId:string,reminderId:string;
const cookie=(userId:string)=>{const payload=Buffer.from(JSON.stringify({userId,exp:Date.now()+3600000})).toString("base64url");return `agritrack_session=${payload}.${createHmac("sha256",secret).update(payload).digest("hex")}`;};
const base=()=>({productionId:lotId,version:0,assessedDate:"2026-10-02",marketable:"850",damaged:"100",wasted:"50",unit:"kg",quantitiesConfirmed:true,evidence:"ISOLATED TEST fixture scale record",cause:"Unknown",priceConfirmed:false});
const post=(request:APIRequestContext,data:unknown,userId=owner)=>request.post("/api/crop-loss",{data,headers:{Cookie:cookie(userId)}});
test.beforeAll(async()=>{
 const passwordHash=await hash(password,4);
 owner=(await db.user.create({data:{name:`Loss TEST ${tag}`,email:`loss-${tag}@example.test`,passwordHash}})).id;
 other=(await db.user.create({data:{name:`Other loss TEST ${tag}`,email:`loss-other-${tag}@example.test`,passwordHash}})).id;
 cropId=(await db.crop.create({data:{name:`Loss TEST crop ${tag}`,seasons:"RABI",soilTypes:"Alluvial",waterNeed:"MEDIUM"}})).id;
 for(const userId of [owner,other]){
 const farm=await db.farm.create({data:{userId,name:`Loss TEST farm ${tag}`,state:"Bihar",district:"Saran"}});
 const field=await db.field.create({data:{farmId:farm.id,name:"Loss TEST field",area:1,soilType:"Alluvial",irrigationMethod:"Surface"}});
 const cycle=await db.cropCycle.create({data:{fieldId:field.id,cropId,season:"RABI",status:"HARVESTED",growthStage:"Maturity"}});
 const lot=await db.production.create({data:{cropCycleId:cycle.id,harvestDate:new Date("2026-10-01"),quantity:1000,unit:"kg"}});
 if(userId===owner){cycleId=cycle.id;lotId=lot.id;await db.sale.create({data:{cropCycleId:cycle.id,productionId:lot.id,saleDate:new Date("2026-10-01"),quantity:800,unit:"kg",pricePerUnit:25,totalRevenue:20000}});}else foreignLotId=lot.id;
 }
 reminderId=(await db.alert.create({data:{userId:owner,dedupeKey:`loss:test:${tag}`,title:"ISOLATED TEST loss reminder",message:"Synthetic test-only reminder, not an agronomic warning.",href:"/crop-loss"}})).id;
});
test.afterAll(async()=>{
 if(lotId)await db.storageInspection.deleteMany({where:{productionId:lotId}});
 if(owner)await db.cropProtectionAssessment.deleteMany({where:{userId:owner}});
 if(owner)await db.cropLossAssessment.deleteMany({where:{production:{cropCycle:{field:{farm:{userId:owner}}}}}});
 if(owner)await db.user.delete({where:{id:owner}});if(other)await db.user.delete({where:{id:other}});if(cropId)await db.crop.delete({where:{id:cropId}});await db.$disconnect();
});
test("loss APIs enforce ownership, reconciliation, idempotency and revision audit",async({request})=>{
 expect((await request.get("/api/crop-loss")).status()).toBe(401);
 expect((await request.post("/api/crop-loss",{data:base()})).status()).toBe(401);
 expect((await request.post("/api/crop-loss/prevention",{data:{cropCycleId:cycleId}})).status()).toBe(401);
 expect((await request.patch("/api/crop-loss/reminders",{data:{id:reminderId}})).status()).toBe(401);
 expect((await post(request,{...base(),productionId:foreignLotId})).status()).toBe(404);
 expect((await post(request,{...base(),synthetic:true})).status()).toBe(400);
 expect((await post(request,{...base(),marketable:"900"})).status()).toBe(400);
 expect((await post(request,{...base(),marketable:"750",damaged:"200"})).status()).toBe(400);
 expect((await post(request,{...base(),unit:"bag"})).status()).toBe(400);
 const saved=await post(request,base());expect(saved.ok()).toBeTruthy();
 expect((await post(request,base())).status()).toBe(409);
 const own=await request.get("/api/crop-loss",{headers:{Cookie:cookie(owner)}});const data=await own.json();const row=data.items.find((r:{id:string})=>r.id===lotId);expect(row.metrics.lossPercent).toBe("15.00");expect(row.metrics.monetaryLoss).toBeNull();expect(data.analytics.year[0].monetaryLoss).toBeNull();
 const foreign=await request.get("/api/crop-loss",{headers:{Cookie:cookie(other)}});expect((await foreign.json()).items.some((r:{id:string})=>r.id===lotId)).toBe(false);
 const correction=await post(request,{...base(),version:1,marketable:"820",damaged:"130",priceConfirmed:true,pricePerUnit:"25",damagedRecovery:"500",priceEvidence:"ISOLATED TEST price receipt"});expect(correction.ok()).toBeTruthy();
 const record=await db.cropLossAssessment.findUniqueOrThrow({where:{productionId:lotId}});expect(record.version).toBe(2);expect((record.revisions as unknown[]).length).toBe(1);expect(await db.cropLossAssessment.count({where:{productionId:lotId}})).toBe(1);
 const competing=await Promise.all([1,2].map(()=>post(request,{...base(),version:2,marketable:"820",damaged:"130"})));
 expect(competing.filter(response=>response.ok())).toHaveLength(1);expect(competing.filter(response=>response.status()===409)).toHaveLength(1);
 expect(await db.cropLossAssessment.count({where:{productionId:lotId}})).toBe(1);
 expect((await request.patch("/api/crop-loss/reminders",{data:{id:reminderId},headers:{Cookie:cookie(other)}})).status()).toBe(404);
 expect((await request.post("/api/crop-loss/prevention",{data:{cropCycleId:cycleId,remind:true},headers:{Cookie:cookie(other)}})).status()).toBe(404);
 const context=await request.post("/api/crop-loss/prevention",{data:{cropCycleId:cycleId},headers:{Cookie:cookie(owner)}});expect(context.ok()).toBeTruthy();const risk=await context.json();expect(risk.weatherStatus).toContain("Insufficient Data");expect(risk.soilStatus).toContain("Insufficient Data");expect(risk.alerts).toEqual([]);expect(risk.officialSources).toHaveLength(2);
 const response=await request.post("/api/crop-loss/prevention",{data:{cropCycleId:cycleId,productionId:lotId,remind:true,simplify:true},headers:{Cookie:cookie(owner)}});
 expect(response.ok()).toBeTruthy();const first=await response.json();
 expect(first.dashboard.mode).toBe("offline");
 expect(first.dashboard.risks.find((risk:{label:string})=>risk.label==="Rainfall probability").status).toBe("Unknown");
 const retry=await request.post("/api/crop-loss/prevention",{data:{cropCycleId:cycleId,productionId:lotId,remind:true},headers:{Cookie:cookie(owner)}});
 expect(retry.ok()).toBeTruthy();const second=await retry.json();
 expect(second.reminderCount).toBe(0);
 expect(first.reminders).toEqual(expect.arrayContaining([expect.objectContaining({cropName:expect.any(String),dueOn:expect.any(String),priority:"Medium",completedAt:null})]));
 expect(second.reminders.map((item:{id:string})=>item.id).sort()).toEqual(first.reminders.map((item:{id:string})=>item.id).sort());

});
test("concurrent harvest confirmations create exactly one original production lot",async({request})=>{
 const existing=await db.cropCycle.findUniqueOrThrow({where:{id:cycleId}});
 const cycle=await db.cropCycle.create({data:{fieldId:existing.fieldId,cropId,season:"RABI",status:"ACTIVE",growthStage:"Maturity"}});
 const day = new Date("2026-10-01T00:00:00Z");
 const field = await db.field.findUniqueOrThrow({ where: { id: cycle.fieldId } });
 const calendar = await db.cropCalendar.create({ data: { userId: owner, cropCycleId: cycle.id, farmId: field.farmId, cropId, state: "Bihar", district: "Patna",
   sowingDate: day, landArea: field.area, areaUnit: field.areaUnit, soilType: field.soilType, irrigationMethod: field.irrigationMethod, datasetVersion: "test" } });
 const activity = await db.cropCalendarActivity.create({ data: { calendarId: calendar.id, activityKey: "watering-test", activityName: "Check water", activityType: "IRRIGATION_REVIEW", scheduledDate: day, description: "Review soil" } });
 const reminder = await db.irrigationSchedule.create({ data: { userId: owner, cropCycleId: cycle.id, scheduledAt: day, status: "PLANNED", isCheckOnly: true, recommendationSource: "CROP_CALENDAR_ACTIVITY:watering-test" } });
 const notice = await db.cropCalendarNotification.create({ data: { userId: owner, activityId: activity.id, notificationDate: day, message: "Review soil" } });
 const watering = { transactionId: randomUUID(), checkId: reminder.id, cropCycleId: cycle.id, irrigationDate: "2026-10-01", waterAppliedLiters: 120, method: "Drip Irrigation" };
 const confirm = () => request.post("/api/irrigation/history", { headers: { Cookie: cookie(owner) }, data: watering });
 expect((await confirm()).status()).toBe(201);
 expect((await confirm()).status()).toBe(200);
 expect(await db.irrigationSchedule.count({ where: { cropCycleId: cycle.id, actualQuantityLiters: { not: null } } })).toBe(1);
 expect((await db.cropCalendarActivity.findUniqueOrThrow({ where: { id: activity.id } })).status).toBe("COMPLETED");
 expect((await db.cropCalendarNotification.findUniqueOrThrow({ where: { id: notice.id } })).isRead).toBe(true);
 const pending = await db.irrigationSchedule.create({ data: { userId: owner, cropCycleId: cycle.id, scheduledAt: day, status: "PLANNED", isCheckOnly: true } });
 const fertilizer = await db.cropCalendarActivity.create({ data: { calendarId: calendar.id, activityKey: "fertilizer-test", activityName: "Check fertilizer", activityType: "FERTILIZER", scheduledDate: day, status: "DELAYED", description: "Review nutrients" } });
 const responses=await Promise.all([1,2].map(()=>request.patch("/api/harvests",{headers:{Cookie:cookie(owner)},data:{action:"harvested",cropCycleId:cycle.id,harvestDate:"2026-10-01",quantity:10,unit:"kg"}})));
 expect(responses.filter(response=>response.status()===200)).toHaveLength(1);
 expect(responses.every(response=>[200,404,409].includes(response.status()))).toBe(true);
 expect(await db.production.count({where:{cropCycleId:cycle.id}})).toBe(1);
 expect((await db.irrigationSchedule.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("CANCELLED");
 expect((await db.cropCalendarActivity.findUniqueOrThrow({ where: { id: fertilizer.id } })).status).toBe("CANCELLED");
 expect((await db.cropCalendarActivity.findUniqueOrThrow({ where: { id: activity.id } })).status).toBe("COMPLETED");
});
test("dashboard forms, analytics, reminders and sale limits use the existing harvest lot",async({page})=>{
 await page.goto("/");await page.locator("#login-email").fill(`loss-${tag}@example.test`);await page.locator("#login-password").fill(password);await page.locator("form").getByRole("button",{name:/sign in/i}).click();await page.waitForURL("**/dashboard");
 await expect(page.getByRole("link",{name:"Review harvest losses and prevention →"})).toBeVisible();
 await page.goto("/production");
 const saleForm=page.locator("form").filter({has:page.locator('select[name="productionId"]')});
 await saleForm.locator('select[name="productionId"]').selectOption(lotId);
 await saleForm.locator('input[name="quantity"]').fill("21");
 await saleForm.locator('input[name="pricePerUnit"]').fill("25");
 await saleForm.getByRole("button",{name:/save sale/i}).click();
 await expect(page).toHaveURL(/error=Sale/);

 const initialReview=page.waitForResponse(response=>response.url().endsWith("/api/crop-loss/prevention")&&response.request().postDataJSON()?.automatic===true);
 await page.goto(`/crop-loss?cycle=${cycleId}`);
 expect((await initialReview).ok()).toBe(true);
 const savedProtection=await db.cropProtectionAssessment.create({data:{userId:owner,cropCycleId:cycleId,cropName:"Test crop",input:{
  symptoms:["Fruit holes","Water standing in field"],fieldHistory:{soilMoisture:"Waterlogged"},
 },findings:{}}});
 const photo=await db.cropProtectionPhoto.create({data:{assessmentId:savedProtection.id,kind:"Supporting photograph",mediaType:"image/png",
  bytes:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64")}});
 await db.cropProtectionAssessment.update({where:{id:savedProtection.id},data:{findings:{visionObservations:{
  [photo.id]:{visibleSymptoms:["Black spots"],checkedAt:new Date().toISOString()},
 }}}});
 await db.rainfallObservation.create({data:{userId:owner,cropCycleId:cycleId,rainfallDate:new Date("2026-10-01"),grossRainfallMm:12,
  source:"MANUAL_OBSERVATION",calculationStatus:"Insufficient Inputs"}});
 const refreshed=page.waitForResponse(response=>response.url().endsWith("/api/crop-loss/prevention")&&response.request().postDataJSON()?.automatic===true);
 await page.evaluate(()=>window.dispatchEvent(new Event("online")));
 expect((await refreshed).ok()).toBe(true);
 const assessment=page.locator("section").filter({has:page.getByRole("heading",{name:"Risk assessment",exact:true})});
 const storage=assessment.locator(".harvest-loss-risks").first();
 await expect(storage.getByText("AI-suspected condition",{exact:true})).toHaveCount(0);
 await expect(storage.getByRole("heading",{name:"Drainage condition"})).toHaveCount(0);
 await assessment.getByText("Before harvest",{exact:true}).click();
 await expect(assessment.getByText("AI-suspected condition",{exact:true})).toBeVisible();
 await expect(assessment.getByText("Potential concern",{exact:true})).toBeVisible();

 const drainage=page.locator(".harvest-loss-risks > li").filter({has:page.getByRole("heading",{name:"Drainage condition"})});
 await expect(drainage.getByText("Confirmed observation",{exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Future crop prevention",exact:true}).locator("..")).toContainText("Drainage condition");
 await drainage.getByText("View more details").click();
 await expect(drainage.getByRole("link",{name:"View saved crop protection photo"})).toHaveAttribute("href",`/api/crop-protection/${savedProtection.id}/photos/${photo.id}`);
 await expect(drainage.getByText("12 mm",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Simplify wording with Gemini"})).toHaveCount(0);
 const drainageReminder=`loss:${cycleId}:inspection:drainage:cycle`;
 expect(await db.alert.count({where:{userId:owner,dedupeKey:drainageReminder}})).toBe(1);
 const repeated=await page.request.post("/api/crop-loss/prevention",{data:{cropCycleId:cycleId,productionId:lotId,automatic:true}});
 expect(repeated.ok()).toBe(true);
 expect(await db.alert.count({where:{userId:owner,dedupeKey:drainageReminder}})).toBe(1);

 await page.getByLabel("Existing harvested lot").selectOption(lotId);await expect(page.getByText("Harvested 1000 kg; sold 800 kg.",{exact:false})).toBeVisible();
 await page.getByLabel("Marketable (kg)",{exact:true}).fill("800");await page.getByLabel("Damaged, excluding waste (kg)",{exact:true}).fill("150");await page.getByLabel("Wasted / discarded (kg)",{exact:true}).fill("50");await page.getByLabel(/I confirm measured quantities/).check();
 await page.getByRole("button",{name:"Save corrected allocation"}).click();await expect(page.getByRole("status").filter({hasText:"Allocation saved"})).toBeVisible();
 await page.getByRole("button",{name:"View detailed analysis"}).click();await page.getByLabel("Group results by").selectOption("field");await expect(page.getByRole("table",{name:"field-wise measured post-harvest outcomes"})).toBeVisible();
 await page.locator("article").filter({hasText:"ISOLATED TEST loss reminder"}).getByRole("button",{name:"Mark reviewed"}).click();await expect(page.locator("article").filter({hasText:"ISOLATED TEST loss reminder"}).getByText("Completed",{exact:true})).toBeVisible();
 await page.goto("/production");
 // All marketable stock was already sold. Damaged/waste cannot be sold again.
 expect(await page.locator(`select[name="productionId"] option[value="${lotId}"]`).count()).toBe(0);
 const unchanged=await db.production.findUniqueOrThrow({where:{id:lotId},include:{sales:true,lossAssessment:true}});expect(unchanged.quantity.toString()).toBe("1000");expect(unchanged.sales).toHaveLength(1);expect(unchanged.lossAssessment!.marketable.toString()).toBe("800");
 await page.goto("/inventory");await expect(page.getByRole("cell",{name:"200 kg",exact:true})).toBeVisible();
 await expect(page.getByRole("cell",{name:"150 kg",exact:true})).toBeVisible();
 await expect(page.getByRole("cell",{name:"50 kg",exact:true})).toBeVisible();
 await expect(page.getByRole("cell",{name:"10 kg",exact:true})).toBeVisible();
});


test("storage inspection API keeps lot ownership, zero readings and concurrent revisions",async({request})=>{
 const save=(data:unknown,userId=owner)=>request.post("/api/crop-loss/inspections",{data,headers:{Cookie:cookie(userId)}});
 const payload={productionId:lotId,version:0,inspectedOn:"2026-10-02",
  findings:{moisture:13,temperature:25,humidity:0,pests:"None observed",mold:"Unknown",condition:"Clean and dry"}};
 expect((await save({...payload,productionId:foreignLotId})).status()).toBe(404);
 expect((await save(payload,other)).status()).toBe(404);
 expect((await save({...payload,inspectedOn:"2026-09-30"})).status()).toBe(400);
 const responses=await Promise.all([save(payload),save(payload)]);
 expect(responses.map(item=>item.status()).sort()).toEqual([201,409]);
 expect((await save({...payload,version:1,findings:{...payload.findings,mold:"Observed"}})).status()).toBe(201);
 const source=await request.get("/api/crop-loss",{headers:{Cookie:cookie(owner)}});
 const lot=(await source.json()).items.find((item:{id:string})=>item.id===lotId);
 expect(lot.storageInspections.map((row:{version:number})=>row.version)).toEqual([2,1]);
 expect(lot.storageInspections[1].findings).toMatchObject({humidity:0,mold:"Unknown"});
 const next={...payload,version:2,findings:{...payload.findings,mold:"Observed",leakage:"Observed",ventilation:"Poor",durationDays:15}};
 const uploaded=await request.post("/api/crop-loss/inspections",{headers:{Cookie:cookie(owner)},multipart:{
  inspection:JSON.stringify(next),
  attachments:{name:"fixture.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4\n%%EOF")},
 }});
 expect(uploaded.status()).toBe(201);
 const fourth=await save({...next,version:3});
 expect(fourth.status()).toBe(201);
 const stored=await db.storageInspectionAttachment.findFirstOrThrow({where:{productionId:lotId,version:3}});
 const url=`/api/crop-loss/inspections/attachments/${stored.id}`;
 expect((await request.get(url,{headers:{Cookie:cookie(owner)}})).headers()["content-disposition"]).toContain("attachment");
 expect((await request.get(url,{headers:{Cookie:cookie(other)}})).status()).toBe(404);
 const reminders=await db.alert.findMany({where:{userId:owner,productionId:lotId,actionId:"storage-safety"}});
 expect(reminders).toHaveLength(1);
 expect(reminders[0].priority).toBe("High");
 expect(await db.production.findUniqueOrThrow({where:{id:lotId},select:{quantity:true}}).then(row=>row.quantity.toString())).toBe("1000");
});

test("storage form and recommendations follow the existing language preference",async({page})=>{
 await page.context().addCookies([{name:"agritrack_session",value:cookie(owner).split("=")[1],url:"http://127.0.0.1:3107"}]);
 await page.goto(`/crop-loss?cycle=${cycleId}&lot=${lotId}`);
 await expect(page.getByRole("heading",{name:"Storage inspection",exact:true})).toBeVisible();
 const preference=await page.request.post("/api/preferences/language",{data:{language:"hi"}});
 expect(preference.ok()).toBeTruthy();
 await page.reload();
 await expect(page.getByRole("heading",{name:"भंडारण की जाँच",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"भंडारण जाँच सहेजें",exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Storage inspection",exact:true})).toHaveCount(0);
});

test("Production records the first harvest once and updates the crop and its schedule", async ({ page }) => {
 const previous = await db.cropCycle.findUniqueOrThrow({ where: { id: cycleId } });
 const cycle = await db.cropCycle.create({ data: { fieldId: previous.fieldId, cropId, season: "KHARIF", status: "ACTIVE" } });
 const schedule = await db.irrigationSchedule.create({
   data: { userId: owner, cropCycleId: cycle.id, scheduledAt: new Date("2026-10-02"), status: "PLANNED", isCheckOnly: true },
 });
 await page.context().addCookies([{ name: "agritrack_session", value: cookie(owner).split("=")[1], url: "http://127.0.0.1:3107" }]);
 await page.goto("/production");
 const form = page.locator("form").filter({ has: page.locator('select[name="cropCycleId"]') });
 await form.locator('select[name="cropCycleId"]').selectOption(cycle.id);
 await form.locator('input[name="harvestDate"]').fill("2026-10-01");
 await form.locator('input[name="quantity"]').fill("10");
 await form.locator('button[type="submit"], button:not([type])').click();
 await expect(page).toHaveURL(/saved=Harvest/);
 expect(await db.cropCycle.findUniqueOrThrow({ where: { id: cycle.id } })).toMatchObject({
   status: "HARVESTED", actualHarvestDate: new Date("2026-10-01"),
 });
 expect((await db.irrigationSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).status).toBe("CANCELLED");
 const confirmation = await page.request.patch("/api/harvests", {
   data: { action: "harvested", cropCycleId: cycle.id, harvestDate: "2026-10-01", quantity: 10, unit: "kg" },
 });
 expect(confirmation.status()).toBe(409);
 expect(await db.production.count({ where: { cropCycleId: cycle.id } })).toBe(1);
});
test("Farm and crop deletion preserve a harvest with a loss allocation", async ({ page }) => {
 const cycle = await db.cropCycle.findUniqueOrThrow({ where: { id: cycleId }, include: { field: true } });
 await page.context().addCookies([{ name: "agritrack_session", value: cookie(owner).split("=")[1], url: "http://127.0.0.1:3107" }]);
 page.on("dialog", dialog => dialog.accept());

 await page.goto("/crops");
 const cropForm = page.locator("form").filter({ has: page.locator(`input[name="id"][value="${cycle.id}"]`) });
 await cropForm.getByRole("button", { name: "Delete crop cycle" }).click();
 await expect(page.getByRole("alert").filter({ hasText: "This crop cycle has linked records that must be preserved" })).toBeVisible();

 await page.goto("/farms");
 const farmForm = page.locator("form").filter({ has: page.locator(`input[name="id"][value="${cycle.field.farmId}"]`) });
 await farmForm.getByRole("button", { name: "Delete farm" }).click();
 await expect(page.getByRole("alert").filter({ hasText: "This farm has linked records that must be preserved" })).toBeVisible();
 expect(await db.production.count({ where: { id: lotId } })).toBe(1);
});
