import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { requireTestDatabase } from "../src/lib/test-database-safety";

const db = new PrismaClient({
  datasourceUrl: requireTestDatabase(process.env.TEST_DATABASE_URL),
});
const email = `upgrade-${randomUUID()}@example.test`;
const password = "AccountFixture123!";

test.afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
});

test("signup, farm and field creation, offline tools, logout and login", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".auth-tabs button").nth(1).click();
  await page.locator("#signup-name").fill("Account Fixture");
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-password").fill(password);
  await page.locator("form.auth-card button[type=submit]").click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/farms");
  const farm = page
    .locator("form.panel")
    .filter({ has: page.locator("#new-farm-state") });
  await farm.locator('input[name="name"]').fill("Account Fixture Farm");
  await page.locator("#new-farm-state").selectOption({ label: "Bihar" });
  await page.locator("#new-farm-district").selectOption({ label: "Saran" });
  await farm.getByRole("button", { name: /save farm/i }).click();
  await expect(page.getByRole("status")).toContainText(/farm/i);

  const field = page
    .locator("form")
    .filter({ has: page.locator('select[name="farmId"]') });
  await field.locator('input[name="name"]').fill("Account Fixture Field");
  await field.locator('input[name="area"]').fill("2");
  await field.locator('select[name="soilType"]').selectOption("Alluvial");
  await field.locator('select[name="irrigationSource"]').selectOption("Canal");
  await field.locator('select[name="irrigationMethod"]').selectOption("Drip");
  await field.getByRole("button", { name: /save field/i }).click();
  await expect(
    page.getByRole("cell", { name: "Account Fixture Field" }),
  ).toBeVisible();

  const account = await db.user.findUniqueOrThrow({
    where: { email },
    include: { farms: { include: { fields: true } } },
  });
  expect(account.farms[0].fields[0].area.toNumber()).toBe(2);
  const crop = await db.crop.upsert({
    where: { name: "Wheat" },
    update: {},
    create: {
      name: "Wheat",
      seasons: "RABI",
      soilTypes: "Alluvial",
      waterNeed: "MEDIUM",
      illustrative: false,
    },
  });
  await page.goto("/crops");
  await page.locator("#cropId").selectOption(crop.id);
  await page.locator('select[name="season"]').selectOption("RABI");
  await page.locator('input[name="sowingDate"]').fill("2026-11-01");
  await page.locator("#cropDurationDays").fill("100");
  await page.getByRole("button", { name: "Save crop cycle" }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("saved") === "Crop cycle created",
  );
  const calendar = await db.cropCalendar.findFirstOrThrow({
    where: { userId: account.id, cropId: crop.id },
  });
  expect(calendar.farmId).toBe(account.farms[0].id);
  expect(calendar.sowingDate.toISOString().slice(0, 10)).toBe("2026-11-01");
  expect(
    await db.cropCalendarActivity.count({ where: { calendarId: calendar.id } }),
  ).toBeGreaterThan(0);
  await page.getByText("Edit crop cycle", { exact: true }).click();
  const edit = page
    .locator("form")
    .filter({ has: page.locator('input[name="id"]') })
    .filter({ has: page.locator('input[name="sowingDate"]') });
  await edit.locator('input[name="sowingDate"]').fill("2026-11-03");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("saved") === "Crop cycle updated",
  );
  expect(
    (
      await db.cropCalendar.findUniqueOrThrow({ where: { id: calendar.id } })
    ).sowingDate
      .toISOString()
      .slice(0, 10),
  ).toBe("2026-11-03");

  const createCycle = page
    .locator("form.panel")
    .filter({ has: page.locator("#cropId") });
  await createCycle.locator("#cropId").selectOption(crop.id);
  await createCycle.locator('select[name="season"]').selectOption("KHARIF");
  await createCycle.locator('input[name="sowingDate"]').fill("2026-07-01");
  await createCycle.getByRole("button", { name: "Save crop cycle" }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("saved") === "Crop cycle created",
  );
  const outsideCalendarScope = await db.cropCycle.findFirstOrThrow({
    where: {
      fieldId: account.farms[0].fields[0].id,
      cropId: crop.id,
      season: "KHARIF",
    },
  });
  expect(
    await db.cropCalendar.count({
      where: { cropCycleId: outsideCalendarScope.id },
    }),
  ).toBe(0);
  for (const route of [
    "/crops",
    "/crop-calendar",
    "/recommendations",
    "/irrigation",
    "/harvests",
    "/inventory",
    "/production",
    "/market",
    "/reports",
    "/weather",
    "/assistant",
  ]) {
    const response = await page.goto(route);
    expect(response?.ok(), route).toBeTruthy();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
  }
  const assistant = await page.request.post("/api/assistant", {
    data: { question: "How can I plan before sowing?" },
  });
  expect(assistant.status()).toBe(200);
  expect(await assistant.json()).toMatchObject({ mode: "offline" });
  expect((await page.request.get("/api/weather/forecast")).status()).toBe(400);
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get("/api/fertilizer/coverage")).status()).toBe(
    401,
  );

  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill("wrong-password");
  await page.locator("form.auth-card button[type=submit]").click();
  await expect(page).toHaveURL((url) =>
    /incorrect/i.test(url.searchParams.get("error") ?? ""),
  );
  await expect(page.locator(".auth-error")).toBeVisible();
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator("form.auth-card button[type=submit]").click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
