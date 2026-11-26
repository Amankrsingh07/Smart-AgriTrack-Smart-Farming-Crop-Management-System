import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { requireTestDatabase } from "../src/lib/test-database-safety";
import { officialBulletinDetails } from "../src/lib/crop-loss-advisories";
const db = new PrismaClient({
  datasourceUrl: requireTestDatabase(process.env.TEST_DATABASE_URL),
});
const tag = randomUUID(),
  password = "PreventionTest123!";
let userId: string, fieldId: string, cycleId: string, cropId: string;
let createdCrop = false;
test.beforeAll(async () => {
  userId = (
    await db.user.create({
      data: {
        name: "ISOLATED prevention TEST",
        email: `prevention-${tag}@example.test`,
        passwordHash: await hash(password, 4),
      },
    })
  ).id;
  const farm = await db.farm.create({
    data: {
      userId,
      name: "ISOLATED TEST farm",
      state: "Bihar",
      district: "Saran",
    },
  });
  fieldId = (
    await db.field.create({
      data: {
        farmId: farm.id,
        name: "ISOLATED TEST North",
        area: 1,
        soilType: "Alluvial",
        irrigationMethod: "Surface",
      },
    })
  ).id;
  const existingCrop = await db.crop.findUnique({ where: { name: "Maize" } });
  if (existingCrop) cropId = existingCrop.id;
  else {
    cropId = (
      await db.crop.create({
        data: {
          name: "Maize",
          seasons: "KHARIF",
          soilTypes: "Alluvial",
          waterNeed: "MEDIUM",
        },
      })
    ).id;
    createdCrop = true;
  }
  cycleId = (
    await db.cropCycle.create({
      data: {
        fieldId,
        cropId,
        season: "KHARIF",
        status: "ACTIVE",
        growthStage: "Establishment",
      },
    })
  ).id;
});
test.afterAll(async () => {
  if (userId) await db.user.delete({ where: { id: userId } });
  if (cropId && createdCrop) await db.crop.delete({ where: { id: cropId } });
  await db.$disconnect();
});
test("forecast preview, historical bulletin labels and rate-limit recovery render safely", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#login-email").fill(`prevention-${tag}@example.test`);
  await page.locator("#login-password").fill(password);
  await page
    .locator("form")
    .getByRole("button", { name: /sign in/i })
    .click();
  await page.waitForURL("**/dashboard");
  // Response fixture is explicitly synthetic UI test data and is never persisted.
  const bulletin = officialBulletinDetails(
    "https://icar-crida.res.in/WDU/2026/SEP_2026/NAAS-Bulletin-07-September-2026.pdf",
    "2026-11-14",
  );
  const fixture = {
    checkedAt: "2026-11-14T09:00:00Z",
    crop: "Maize",
    stage: "Establishment",
    weatherStatus: "TEST ONLY provider rate limit",
    weatherIssue: {
      code: "RATE_LIMITED",
      message: "TEST ONLY HTTP 429",
      httpStatus: 429,
      action: "The provider returned HTTP 429. Wait before retrying.",
      source: "TEST ONLY forecast fixture",
      sourceUrl: "https://open-meteo.com/en/docs",
      href: "/weather",
    },
    weatherFetchedAt: "2026-11-14T09:00:00Z",
    forecastPreview: [
      {
        date: "2026-11-14",
        rainMm: 1,
        rainProbability: 40,
        minC: 18,
        maxC: 28,
      },
    ],
    soilStatus: "TEST ONLY no report",
    soilDetails: {
      issues: [
        { code: "NO_FIELD_REPORT", message: "TEST ONLY missing report" },
      ],
      href: `/soil-health?field=${fieldId}&cycle=${cycleId}`,
      reportId: null,
      checkedReports: 0,
      otherCropReports: 0,
      scope: "Synthetic UI fixture",
    },
    stageGuidance: null,
    alerts: [],
    advice: {
      summary: "TEST ONLY context",
      drainage: "TEST ONLY",
      nutrientPlan: "TEST ONLY",
      scope: "Synthetic UI fixture",
      sources: [],
    },
    history: [],
    officialSources: [
      {
        title: "TEST ONLY official index fixture",
        url: "https://icar-crida.res.in/Weather_info_Agromet_Advisory.html",
        scope: "TEST ONLY index fixture",
        checkedAt: "2026-11-14T09:00:00Z",
        available: true,
        links: [bulletin.url],
        bulletins: [bulletin],
        note: "Synthetic response for UI verification",
      },
    ],
    reminderCount: 0,
    limitations: "Synthetic UI fixture; not a real forecast or advisory.",
  };
  let recovered = false;
  await page.route("**/api/crop-loss/prevention", (route) =>
    route.fulfill({
      json: recovered
        ? {
            ...fixture,
            weatherIssue: null,
            weatherStatus: "TEST ONLY recovered model forecast",
          }
        : { ...fixture, forecastPreview: [], weatherFetchedAt: null },
    }),
  );
  await page.goto(`/crop-loss?cycle=${cycleId}`);
  await page.getByText("Prevention review", { exact: true }).click();
  await page.getByRole("button", { name: "Review risks & guidance" }).click();
  await expect(
    page.getByText("Weather diagnostic: RATE_LIMITED"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry live weather review" }),
  ).toBeVisible();
  recovered = true;
  await page.getByRole("button", { name: "Retry live weather review" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Available forecast data · next three model dates",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View scientific sources" }).click();
  await expect(
    page.getByRole("link", {
      name: "Historical bulletin — date in link 2026-09-07",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/URL filename only; not independently verified/),
  ).toBeVisible();
});
