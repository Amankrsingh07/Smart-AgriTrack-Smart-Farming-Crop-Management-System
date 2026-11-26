import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac, randomUUID } from "node:crypto";
import { requireTestDatabase } from "../src/lib/test-database-safety";
import { languages } from "../src/i18n/languages";
import { calendarCatalog } from "../src/i18n/crop-calendar";
import { calendarContent } from "../src/i18n/crop-calendar/format";
import { cropAdviceLabel } from "../src/i18n/crop-advice";
import { fieldAdviceText } from "../src/i18n/crop-advice/field";
import { dateOnlyInIndia } from "../src/lib/crop-cycle-status";

const db = new PrismaClient({
  datasourceUrl: requireTestDatabase(process.env.TEST_DATABASE_URL),
});
const tag = randomUUID();
const users: string[] = [];
const fieldName = "Advice Test Lower Field";
const today = dateOnlyInIndia(new Date());
let cycleId: string;
let otherCycleId: string;

function session(userId: string) {
  const body = Buffer.from(
    JSON.stringify({ userId, exp: Date.now() + 3_600_000 }),
  ).toString("base64url");
  return (
    body +
    "." +
    createHmac("sha256", "isolated-soil-tests-only-32-characters-minimum")
      .update(body)
      .digest("hex")
  );
}

test.beforeAll(async () => {
  for (const role of ["owner", "other"]) {
    const user = await db.user.create({
      data: {
        name: role,
        email: `advice-${role}-${tag}@example.test`,
        passwordHash: "test-only",
      },
    });
    users.push(user.id);
  }
  const crop = await db.crop.upsert({
    where: { name: "Maize" },
    update: {},
    create: {
      name: "Maize",
      soilTypes: "Alluvial",
      seasons: "KHARIF",
      waterNeed: "MEDIUM",
    },
  });
  async function createCycle(userId: string, name: string) {
    const farm = await db.farm.create({
      data: {
        userId,
        name: "Advice Test Farm",
        state: "Bihar",
        district: "Saran",
      },
    });
    const field = await db.field.create({
      data: {
        farmId: farm.id,
        name,
        soilType: "Alluvial",
        area: 2,
        irrigationMethod: "Drip",
      },
    });
    return db.cropCycle.create({
      data: {
        fieldId: field.id,
        cropId: crop.id,
        status: "ACTIVE",
        season: "KHARIF",
        growthStage: "Maturity",
        expectedHarvestDate: today,
      },
    });
  }
  const cycle = await createCycle(users[0], fieldName);
  cycleId = cycle.id;
  await createCycle(users[0], "Advice Test Upper Field");
  otherCycleId = (await createCycle(users[1], "Private Advice Field")).id;
  await db.irrigationSchedule.create({
    data: {
      userId: users[0],
      cropCycleId: cycleId,
      scheduledAt: today,
      status: "PLANNED",
      isCheckOnly: true,
    },
  });
  await db.cropProtectionAssessment.create({
    data: {
      userId: users[0],
      cropCycleId: cycleId,
      cropName: crop.name,
      input: {},
      findings: { pollutionStatus: "Possible Pollution" },
    },
  });
  await db.alert.create({
    data: {
      userId: users[0],
      title: "Test loss reminder",
      message: "Review storage",
      dueOn: today,
      dedupeKey: `loss:${cycleId}:test`,
      href: `/crop-loss?cycle=${cycleId}`,
    },
  });
});

test.afterAll(async () => {
  await db.cropProtectionAssessment.deleteMany({
    where: { userId: { in: users } },
  });
  await db.user.deleteMany({ where: { id: { in: users } } });
  // Maize is shared catalog data in the disposable database, not a user fixture.
  await db.$disconnect();
});

test("saved field advice works offline, picks the right field in linked tools, and stays readable in both themes", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "agritrack_session",
      value: session(users[0]),
      url: "http://127.0.0.1:3107",
    },
  ]);
  await page.setViewportSize({ width: 375, height: 850 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/recommendations");
  await expect(
    page.getByRole("heading", { name: "What should I do today?" }),
  ).toBeVisible();
  await expect(page.getByText("Private Advice Field")).toHaveCount(0);
  const field = page
    .locator(".crop-advice-crop")
    .filter({ hasText: fieldName });
  await expect(field).toBeVisible();
  await expect(field.locator("img")).toHaveAttribute("src", /maize\.webp/);
  await expect(page.locator(".recommendations-page")).toHaveCSS(
    "background-color",
    "rgb(244, 247, 242)",
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".recommendations-page")).toHaveCSS(
    "background-color",
    "rgb(16, 27, 21)",
  );
  await expect(page.locator(".crop-advice-heading h1")).toHaveCSS(
    "color",
    "rgb(240, 247, 241)",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);

  await page.locator("#advice-crop").selectOption(cycleId);
  await expect(page.locator(".crop-advice-crop")).toHaveCount(1);
  const priorities = page.locator(".crop-today li");
  await expect(priorities.first()).toContainText(
    "Keep the suspect produce separate",
  );
  await expect(
    priorities.filter({ hasText: "A watering check is scheduled" }),
  ).toHaveCount(1);
  await expect(
    priorities.filter({
      hasText: "Review your saved loss-prevention reminder",
    }),
  ).toHaveCount(1);
  await field.getByText("Sources and limits", { exact: true }).click();
  await expect(field.getByRole("link", { name: /KVK Mohol/ })).toBeVisible();
  await field.getByText("Irrigation", { exact: true }).click();
  await expect(field.getByText("Estimated crop water demand")).toBeVisible();
  await expect(
    field.getByRole("link", { name: "Historical district climate normal" }),
  ).toBeVisible();
  await field.getByText("Irrigation", { exact: true }).click();
  await field.getByText("Weather", { exact: true }).click();
  await expect(
    field.getByText("Save the farm’s map location for a local forecast."),
  ).toBeVisible();
  await field
    .getByRole("button", { name: "Explain soil advice online" })
    .click();
  await expect(field.getByRole("status")).toContainText("Offline");
  await page.route("**/api/crop-soil-advice", (route) =>
    route.fulfill({
      json: {
        mode: "online",
        message: "Explanation from bundled references.",
        tips: [
          fieldAdviceText("en", "soilCheck"),
          fieldAdviceText("en", "limits"),
        ],
      },
    }),
  );
  await field
    .getByRole("button", { name: "Explain soil advice online" })
    .click();
  await expect(field.locator(".farmer-advice-card")).toHaveCSS(
    "background-color",
    "rgb(37, 59, 46)",
  );
  await page.unroute("**/api/crop-soil-advice");
  const unauthorized = await page.request.post("/api/crop-soil-advice", {
    data: { cropCycleId: otherCycleId },
  });
  expect(unauthorized.status()).toBe(404);

  for (const [topic, url] of [
    ["Irrigation", `/irrigation?cycle=${cycleId}`],
    ["Crop calendar", `/crop-calendar?cycle=${cycleId}`],
    ["Harvest", `/harvests?cropCycleId=${cycleId}#harvest-${cycleId}`],
    ["Prevent crop loss", `/crop-loss?cycle=${cycleId}`],
    [
      "Pests and disease",
      `/harvests?cropCycleId=${cycleId}#protection-${cycleId}`,
    ],
  ]) {
    await field.getByText(topic, { exact: true }).click();
    const href = await field
      .locator("details[open]")
      .getByRole("link", { name: "Open ↗", exact: true })
      .filter({ hasText: "Open" })
      .all();
    expect(
      (await Promise.all(href.map((link) => link.getAttribute("href")))).some(
        (value) => value?.startsWith(url),
      ),
      topic,
    ).toBe(true);
  }
  await page.goto(`/irrigation?cycle=${cycleId}`);
  await expect(
    page
      .locator("select")
      .filter({ has: page.locator(`option[value="${cycleId}"]`) })
      .first(),
  ).toHaveValue(cycleId);
  await page.goto(`/crop-calendar?cycle=${cycleId}`);
  await expect(
    page
      .locator("#generate-calendar select")
      .filter({ has: page.locator(`option[value="${cycleId}"]`) }),
  ).toHaveValue(cycleId);
  await page.goto(`/harvests?cropCycleId=${cycleId}`);
  await expect(page.locator(`#protection-${cycleId}`)).toBeVisible();
  await page.goto(`/crop-loss?cycle=${cycleId}`);
  await expect(page.locator(".harvest-loss-dashboard")).toBeVisible();

  await page.goto("/recommendations");
  for (const { code } of languages.slice(1)) {
    await page.locator(".language-selector select").selectOption(code);
    await expect(
      page.getByRole("heading", { name: fieldAdviceText(code, "today") }),
    ).toBeVisible();
    await expect(page.locator(".crop-today")).toContainText(
      fieldAdviceText(code, "safetyReview"),
    );
  }
});

test("assistant falls back offline for the selected crop and rejects another farmer's crop", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "agritrack_session",
      value: session(users[0]),
      url: "http://127.0.0.1:3107",
    },
    { name: "agritrack_locale", value: "hi", url: "http://127.0.0.1:3107" },
  ]);
  const answer = await page.request.post("/api/assistant", {
    data: { question: "How should I check this crop?", cropCycleId: cycleId },
  });
  expect(answer.status()).toBe(200);
  expect(await answer.json()).toMatchObject({
    mode: "offline",
    answer: expect.stringContaining(cropAdviceLabel("Maize", "hi")),
  });
  const denied = await page.request.post("/api/assistant", {
    data: {
      question: "How should I check this crop?",
      cropCycleId: otherCycleId,
    },
  });
  expect(denied.status()).toBe(404);
});

test("existing calendar cards switch language without changing saved activities", async ({
  page,
}) => {
  await db.user.update({ where: { id: users[0] }, data: { language: "en" } });
  await db.cropCycle.update({
    where: { id: cycleId },
    data: { sowingDate: today, expectedHarvestDate: null },
  });
  await page.context().addCookies([
    {
      name: "agritrack_session",
      value: session(users[0]),
      url: "http://127.0.0.1:3107",
    },
  ]);
  await page.route("**/api/weather/forecast?**", (route) =>
    route.fulfill({ status: 503, json: { success: false } }),
  );
  const generated = await page.request.post("/api/crop-calendar/generate", {
    data: {
      cropCycleId: cycleId,
      sowingDate: today.toISOString().slice(0, 10),
    },
  });
  expect(generated.status(), await generated.text()).toBe(201);
  await page.goto(`/crop-calendar?cycle=${cycleId}`);
  const card = page.locator(".crop-calendar-activity").filter({
    has: page.getByRole("heading", {
      name: "Land preparation review",
      exact: true,
    }),
  });
  await expect(card).toHaveCount(1);
  const id = await card.getAttribute("id");
  const sameCard = page.locator(`#${id}`);
  const original = await db.cropCalendarActivity.findUniqueOrThrow({
    where: { id: id!.slice("activity-".length) },
  });
  const link = await sameCard
    .locator(".crop-calendar-source")
    .getAttribute("href");
  for (const code of ["hi", "ta", "or"]) {
    await page.locator(".language-selector select").selectOption(code);
    const catalog = calendarCatalog(code);
    const title = calendarContent(catalog, original.activityName);
    expect(title).not.toBe(original.activityName);
    await expect(sameCard.locator("h3")).toHaveText(title);
    await expect(sameCard.locator(".activity-description")).not.toContainText(
      "Observation reminder only",
    );
    await expect(
      sameCard.locator(".crop-calendar-recommendation"),
    ).not.toHaveText(original.recommendation!);
    await expect(sameCard.locator(".crop-calendar-source")).toHaveAttribute(
      "href",
      link!,
    );
  }
  await page.locator(".language-selector select").selectOption("en");
  await expect(sameCard.locator("h3")).toHaveText("Land preparation review");
  expect(
    await db.cropCalendarActivity.findUnique({ where: { id: original.id } }),
  ).toEqual(original);
});

test("irrigation offers all soil textures and submits an added choice", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "agritrack_session",
      value: session(users[0]),
      url: "http://127.0.0.1:3107",
    },
    { name: "agritrack_locale", value: "en", url: "http://127.0.0.1:3107" },
  ]);
  await page.goto(`/irrigation?cycle=${cycleId}`);
  const soil = page.locator("select").filter({
    has: page.locator('option[value="Silty Clay Loam"]'),
  });
  await expect(soil.locator("option")).toHaveCount(17);
  await soil.selectOption("Silty Clay Loam");
  await expect(soil).toHaveValue("Silty Clay Loam");

  const response = await page.request.post("/api/irrigation/planner", {
    data: {
      cropCycleId: cycleId,
      soil: await soil.inputValue(),
      growthStage: "Vegetative",
      method: "Drip Irrigation",
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const result = await response.json();
  expect(result.data.source.soil).toContain("Silt clay loam");
  expect(result.data.depletionMm).toBeUndefined();
});

test("irrigation opens the measured form and the API protects reminder writes", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "agritrack_session",
      value: session(users[0]),
      url: "http://127.0.0.1:3107",
    },
    { name: "agritrack_locale", value: "en", url: "http://127.0.0.1:3107" },
  ]);
  const originalCount = await db.irrigationSchedule.count({
    where: { cropCycleId: cycleId },
  });
  await page.goto(`/irrigation?cycle=${cycleId}`);
  await expect(
    page.getByRole("button", { name: "Load Demo Data" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Irrigation mode", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Soil values and optional overrides", { exact: true }),
  ).toBeVisible();
  const demo = await page.request.post("/api/irrigation/planner", {
    data: { cropCycleId: cycleId, mode: "demo", save: true },
  });
  expect(demo.status()).toBe(422);
  const estimated = await page.request.post("/api/irrigation/planner", {
    data: { cropCycleId: cycleId, mode: "estimated", save: true },
  });
  expect(estimated.status()).toBe(422);
  const measured = await page.request.post("/api/irrigation/planner", {
    data: { cropCycleId: cycleId, mode: "measured" },
  });
  expect(measured.ok(), await measured.text()).toBeTruthy();
  const { data } = await measured.json();
  expect(data.kcMin).toBe(0.35);
  expect(data.kcMax).toBe(0.6);
  expect(data.available).toBe(false);
  expect(data.source.soil).toMatch(/field measurements/i);
  expect(
    await db.irrigationSchedule.count({ where: { cropCycleId: cycleId } }),
  ).toBe(originalCount);
});
