import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { requireTestDatabase } from "../src/lib/test-database-safety";
const db = new PrismaClient({ datasourceUrl: requireTestDatabase(process.env.TEST_DATABASE_URL) });
const key = "isolated-soil-tests-only-32-characters-minimum";
const tag = randomUUID(); const password = "TestPassword123!";
let owner: string, other: string, fieldId: string, farmId: string, cropId: string, cycleId: string;
const cookie = (userId: string) => { const payload = Buffer.from(JSON.stringify({userId,exp:Date.now()+3600000})).toString("base64url");return `agritrack_session=${payload}.${createHmac("sha256",key).update(payload).digest("hex")}`; };
test.beforeAll(async()=>{
 const passwordHash = await hash(password,4);
 const a=await db.user.create({data:{name:`Soil owner ${tag}`,email:`soil-${tag}@example.test`,passwordHash}});owner=a.id;
 const b=await db.user.create({data:{name:`Soil other ${tag}`,email:`other-${tag}@example.test`,passwordHash}});other=b.id;
 const farm=await db.farm.create({data:{userId:owner,name:`Farm ${tag}`,state:"Bihar",district:"Saran"}});farmId=farm.id;
 const field=await db.field.create({data:{farmId,name:`Field ${tag}`,area:1,areaUnit:"ha",soilType:"Alluvial",irrigationMethod:"Surface"}});fieldId=field.id;
 const crop=await db.crop.create({data:{name:`Soil test crop ${tag}`,seasons:"RABI",soilTypes:"Alluvial",waterNeed:"MEDIUM"}});cropId=crop.id;
 const cycle=await db.cropCycle.create({data:{fieldId,cropId,season:"RABI",growthStage:"Vegetative"}});cycleId=cycle.id;
});
test.afterAll(async()=>{
 // Delete only exact test-owned IDs; never reset, truncate or seed an application database.
 if(owner) {
   await db.fertilizerStockMovement.deleteMany({ where: { product: { ownerId: owner } } });
   await db.fertilizerPrice.deleteMany({ where: { product: { ownerId: owner } } });
   await db.fertilizerProduct.deleteMany({ where: { ownerId: owner } });
 }
 if(owner)await db.user.delete({where:{id:owner}});if(other)await db.user.delete({where:{id:other}});if(cropId)await db.crop.delete({where:{id:cropId}});await db.$disconnect();
});
test("fertilizer stock writes are owner scoped, atomic and safe to retry", async ({ request }) => {
  const endpoint = "/api/fertilizer/stock";
  expect((await request.post(endpoint, { data: { action: "addProduct", grade: "Urea" } })).status()).toBe(401);
  const add = () => request.post(endpoint, { headers: { Cookie: cookie(owner) }, data: { action: "addProduct", grade: "Urea" } });
  const addResults = await Promise.all([add(), add()]);
  expect(addResults.map(response => response.status())).toEqual([200, 200]);
  const [product, duplicate] = await Promise.all(addResults.map(response => response.json()));
  expect(duplicate.id).toBe(product.id);
  const movement = { productId: product.id, requestKey: randomUUID(), kind: "PURCHASE", quantityKg: 50, occurredOn: "2026-01-01", totalCost: 500 };
  const send = (input: typeof movement, user = owner) => request.post(endpoint, { headers: { Cookie: cookie(user) }, data: { action: "movement", movement: input } });
  expect((await send(movement, other)).status()).toBe(404);
  expect((await send(movement)).status()).toBe(201);
  expect((await send(movement)).status()).toBe(200);
  expect((await send({ ...movement, quantityKg: 51 })).status()).toBe(409);
  const addDap = (manufacturer: string, source: string, packSizeKg: number) => request.post(endpoint, {
    headers: { Cookie: cookie(owner) },
    data: { action: "addProduct", grade: "DAP", manufacturer, source, packSizeKg },
  });
  const variants = await Promise.all([
    addDap("Manufacturer A", "Dealer A", 50),
    addDap("Manufacturer A", "Dealer A", 50),
    addDap("Manufacturer A", "Dealer A", 25),
    addDap("Manufacturer B", "Dealer A", 50),
    addDap("Manufacturer A", "Dealer B", 50),
  ]);
  expect(variants.map(response => response.status())).toEqual([200, 200, 200, 200, 200]);
  const ids = await Promise.all(variants.map(async response => (await response.json()).id));
  expect(ids[0]).toBe(ids[1]);
  expect(new Set(ids).size).toBe(4);
  const usage = { productId: product.id, kind: "USE", quantityKg: 30, occurredOn: "2026-01-01" };
  const concurrent = await Promise.all([1, 2].map(() => request.post(endpoint, {
    headers: { Cookie: cookie(owner) }, data: { action: "movement", movement: { ...usage, requestKey: randomUUID() } },
  })));
  expect(concurrent.map(response => response.status()).sort()).toEqual([201, 409]);
  const balance = await db.fertilizerStockMovement.aggregate({ where: { productId: product.id }, _sum: { deltaKg: true } });
  expect(Number(balance._sum.deltaKg)).toBe(20);
  expect(await db.fertilizerPrice.count({ where: { productId: product.id } })).toBe(1);
});

test("confirming actual fertilizer use deducts stock and posts a single expense", async ({ request }) => {
  const headers = { Cookie: cookie(owner) };
  const stockResponse = await request.post("/api/fertilizer/stock", { headers, data: { action: "addProduct", grade: "MOP" } });
  expect(stockResponse.ok()).toBeTruthy();
  const { id: productId } = await stockResponse.json();
  const stock = await request.post("/api/fertilizer/stock", { headers, data: { action: "movement", movement: {
    productId, kind: "OPENING", requestKey: randomUUID(), quantityKg: 10, occurredOn: "2026-01-01",
  } } });
  expect(stock.status()).toBe(201);
  const app = await db.fertilizerApplication.create({ data: {
    cropCycleId: cycleId, requestKey: randomUUID(), product: "MOP", quantityKg: 4,
    composition: { n: 0, p2o5: 0, k2o: .6 }, scheduledDate: new Date("2026-01-02"), revisions: [],
  } });
  const url = `/api/fertilizer/applications/${app.id}/confirm`;
  const data = { productId, version: app.version, requestKey: randomUUID(), appliedOn: "2026-01-02", quantityKg: 4, cost: 120 };
  try {
    expect((await request.post(url, { headers: { Cookie: cookie(other) }, data })).status()).toBe(404);
    expect((await request.post(url, { headers, data: { ...data, quantityKg: 11 } })).status()).toBe(409);
    const results = await Promise.all([request.post(url, { headers, data }), request.post(url, { headers, data })]);
    expect(results.map(response => response.status())).toEqual([200, 200]);
    expect((await Promise.all(results.map(response => response.json()))).map(row => row.replayed).sort()).toEqual([false, true]);
    const recorded = await db.fertilizerApplication.findUniqueOrThrow({ where: { id: app.id }, include: { expense: true } });
    expect(recorded.status).toBe("APPLIED");
    expect(recorded.expense?.amount.toNumber()).toBe(120);
    expect(await db.fertilizerStockMovement.count({ where: { productId, kind: "USE" } })).toBe(1);
  } finally {
    await db.fertilizerApplication.delete({ where: { id: app.id } });
  }
});

test("farmer fertilizer form keeps report readings and verified regional quantities separate", async ({ page }) => {
  await db.user.update({ where: { id: owner }, data: { language: "en" } });
  const wheat = await db.crop.upsert({ where: { name: "Wheat" }, update: {}, create: { name: "Wheat", seasons: "RABI", soilTypes: "Alluvial", waterNeed: "MEDIUM" } });
  const wheatCycle = await db.cropCycle.create({ data: { fieldId, cropId: wheat.id, season: "RABI" } });
  await page.context().addCookies([{ name: "agritrack_session", value: cookie(owner).split("=")[1], url: "http://127.0.0.1:3107" }]);
  await page.goto(`/fertilizer-recommendation?cycle=${wheatCycle.id}`);
  await expect(page.getByLabel("Saved crop")).toHaveValue(wheatCycle.id);
  await expect(page.getByLabel("Field area", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("N", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "See fertilizer guidance" }).click();
  await expect(page.getByRole("heading", { name: "General fertilizer guidance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fertilizer quantity" })).toHaveCount(0);
  await expect(page.getByText(/compatible soil test and a validated/)).toBeVisible();
  expect(await db.fertilizerRecommendationHistory.count({ where: { cropCycleId: wheatCycle.id } })).toBe(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Yes", { exact: true }).check();
  await page.getByLabel("Crop growth stage").selectOption("Vegetative");
  await page.getByLabel("Area unit").selectOption("acre");
  await page.getByLabel("Field area", { exact: true }).fill("1");
  await page.getByLabel("P", { exact: true }).fill("0");
  await page.getByText("Advanced Soil Report Details", { exact: true }).click();
  await page.getByLabel("Available P unit").selectOption("ppm");
  await page.getByRole("button", { name: "See fertilizer guidance" }).click();
  await expect(page.getByText("Soil screening result", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fertilizer quantity" })).toHaveCount(0);
  await page.getByText("Check regional recommendation conditions", { exact: true }).click();
  await page.getByRole("checkbox", { name: /I checked the publication/ }).check();
  await expect(page.getByRole("heading", { name: "Fertilizer quantity" })).toBeVisible();
  await expect(page.getByText(/kg per acre/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "When to apply" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Estimated cost" })).toHaveCount(0);
  await page.getByText("Enter local fertilizer prices (optional)", { exact: true }).click();
  for (const name of ["Urea", "DAP", "MOP"]) await page.getByLabel(new RegExp(`^${name} ·`)).fill("25");
  await expect(page.getByRole("heading", { name: "Estimated cost" })).toBeVisible();
  const record = await db.fertilizerRecommendationHistory.findFirstOrThrow({ where: { cropCycleId: wheatCycle.id } });
  expect(record.input).toMatchObject({ phosphorusValue: 0, phosphorusUnit: "ppm", fieldAreaHa: 0.40468564224 });
  expect(record.input).not.toHaveProperty("nitrogenValue");
  expect(record.input).not.toHaveProperty("potassiumValue");
  expect(record.result).toMatchObject({ nutrients: [{ value: null, rating: "Unknown" }, { value: 0, rating: "Unknown" }, { value: null, rating: "Unknown" }] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.context().addCookies([{ name: "agritrack_locale", value: "hi", url: "http://127.0.0.1:3107" }]);
  await page.reload();
  await page.getByRole("button", { name: "खाद की सलाह देखें" }).click();
  await expect(page.getByRole("heading", { name: "आपकी फसल" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "जानकारी का स्रोत" })).toBeVisible();
});

test("report scan rejects a mislabeled file before extraction", async ({ request }) => {
  const response = await request.post("/api/soil-health/scan", {
    headers: { Cookie: cookie(owner) },
    multipart: { report: { name: "report.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF") } },
  });
  expect(response.status()).toBe(400);
});

test("local PDF extraction shows measured units and requires farmer review", async ({ page }) => {
  test.skip(spawnSync("pdftotext", ["-v"]).status !== 0 || spawnSync("pdfinfo", ["-v"]).status !== 0, "Local PDF tools are optional");
  const stream = "BT /F1 12 Tf 40 750 Td (N: 0 kg/acre) Tj 0 -18 Td (pH: 7.2) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  await page.context().addCookies([{ name: "agritrack_session", value: cookie(owner).split("=")[1], url: "http://127.0.0.1:3107" }]);
  await page.goto(`/fertilizer-recommendation?cycle=${cycleId}`);
  await page.getByLabel("Yes", { exact: true }).check();
  await page.getByLabel("Scan a PDF or photo (optional)").setInputFiles({ name: "test-soil.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) });
  await expect(page.getByLabel("N", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Available N unit")).toHaveValue("kg/acre");
  await expect(page.getByLabel("Available N test method")).toHaveValue("");
  await expect(page.getByLabel("pH", { exact: true })).toHaveValue("7.2");
  const submit = page.getByRole("button", { name: "See fertilizer guidance" });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: /I checked the values/ }).check();
  await expect(submit).toBeEnabled();
});
