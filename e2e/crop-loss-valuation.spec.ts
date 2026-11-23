import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { requireTestDatabase } from "../src/lib/test-database-safety";
const db = new PrismaClient({
  datasourceUrl: requireTestDatabase(process.env.TEST_DATABASE_URL),
});
const tag = randomUUID(),
  password = "ValuationTest123!";
let userId: string, cropId: string, lotId: string;
test.beforeAll(async () => {
  userId = (
    await db.user.create({
      data: {
        name: "ISOLATED valuation TEST",
        email: `valuation-${tag}@example.test`,
        passwordHash: await hash(password, 4),
      },
    })
  ).id;
  const farm = await db.farm.create({
    data: {
      userId,
      name: "ISOLATED TEST Farm",
      state: "Bihar",
      district: "Saran",
    },
  });
  const field = await db.field.create({
    data: {
      farmId: farm.id,
      name: "ISOLATED TEST North",
      area: 1,
      soilType: "Alluvial",
      irrigationMethod: "Surface",
    },
  });
  cropId = (
    await db.crop.create({
      data: {
        name: `Wheat TEST ${tag}`,
        seasons: "RABI",
        soilTypes: "Alluvial",
        waterNeed: "MEDIUM",
      },
    })
  ).id;
  const cycle = await db.cropCycle.create({
    data: { fieldId: field.id, cropId, season: "RABI", status: "HARVESTED" },
  });
  lotId = (
    await db.production.create({
      data: {
        cropCycleId: cycle.id,
        harvestDate: new Date("2026-10-01"),
        quantity: 50,
        unit: "quintal",
      },
    })
  ).id;
});
test.afterAll(async () => {
  if (lotId)
    await db.cropLossAssessment.deleteMany({ where: { productionId: lotId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  if (cropId) await db.crop.delete({ where: { id: cropId } });
  await db.$disconnect();
});
test("valuation fields persist, exact missing reasons appear, and verified Wheat shows ₹15,000 after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#login-email").fill(`valuation-${tag}@example.test`);
  await page.locator("#login-password").fill(password);
  await page
    .locator("form")
    .getByRole("button", { name: /sign in/i })
    .click();
  await page.waitForURL("**/dashboard");
  await page.goto("/crop-loss");
  await page.getByLabel("Existing harvested lot").selectOption(lotId);
  await page.getByLabel("Assessment date", { exact: true }).fill("2026-10-02");
  await page.getByLabel("Marketable (quintal)", { exact: true }).fill("42");
  await page
    .getByLabel("Damaged, excluding waste (quintal)", { exact: true })
    .fill("5");
  await page
    .getByLabel("Wasted / discarded (quintal)", { exact: true })
    .fill("3");
  await page
    .getByLabel("Measurement evidence / record reference", { exact: true })
    .fill("ISOLATED TEST scale evidence");
  await page
    .getByLabel("Full-quality INR per quintal", { exact: true })
    .fill("2500");
  await page
    .getByLabel(
      "Total recovered INR from damaged portion (explicit zero if none)",
      { exact: true },
    )
    .fill("5000");
  await expect(page.locator("#crop-loss-valuation-status")).toContainText(
    "Missing price/recovery evidence",
  );
  await expect(page.locator("#crop-loss-valuation-status")).toContainText(
    "Missing valuation attestation",
  );
  await page.getByLabel(/I confirm measured quantities/).check();
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/crop-loss") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save measured allocation" }).click();
  const incomplete = await pending;
  expect(incomplete.request().postDataJSON()).toMatchObject({
    pricePerUnit: "2500",
    damagedRecovery: "5000",
    priceConfirmed: false,
  });
  const first = await incomplete.json();
  expect(first.monetaryLoss).toBeNull();
  expect(first.lossPercent).toBe("16.00");
  expect(first.wastePercent).toBe("6.00");
  const persisted = await db.cropLossAssessment.findUniqueOrThrow({
    where: { productionId: lotId },
  });
  expect(persisted.pricePerUnit!.toString()).toBe("2500");
  expect(persisted.damagedRecovery!.toString()).toBe("5000");
  expect(persisted.priceEvidence).toBeNull();
  expect(persisted.priceConfirmed).toBe(false);
  await expect(
    page.getByRole("status").filter({ hasText: "Allocation saved." }),
  ).toContainText("Missing valuation attestation");
  const groups = await page.request.get("/api/crop-loss");
  const initial = await groups.json();
  for (const dimension of ["year", "season", "crop", "field"]) {
    expect(initial.analytics[dimension][0].monetaryLoss).toBeNull();
    expect(
      initial.analytics[dimension][0].valuationIssues.map(
        (issue: { code: string }) => issue.code,
      ),
    ).toContain("MISSING_EVIDENCE");
  }
  await page
    .getByLabel("Price/recovery evidence: receipt, date and reference", {
      exact: true,
    })
    .fill("ISOLATED TEST full-quality quote + damaged recovery receipt");
  await page
    .getByLabel(/I verified same-unit price and actual damaged recovery/)
    .check();
  await page.getByLabel(/I confirm measured quantities/).check();
  const verified = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/crop-loss") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save corrected allocation" }).click();
  const response = await verified;
  expect(response.request().postDataJSON()).toMatchObject({
    pricePerUnit: "2500",
    damagedRecovery: "5000",
    priceConfirmed: true,
    priceEvidence:
      "ISOLATED TEST full-quality quote + damaged recovery receipt",
  });
  expect((await response.json()).monetaryLoss).toBe("15000.00");
  await expect(
    page.getByRole("status").filter({ hasText: "Allocation saved." }),
  ).toContainText("₹15,000");
  await expect(page.locator(".harvest-loss-metrics")).toContainText("₹15,000");
  await expect(page.locator(".harvest-loss-metrics")).toContainText("16.00 %");
  await expect(
    page.getByText("Harvest distribution", { exact: true }),
  ).toBeVisible();
  const grid = page.locator(".harvest-loss-risks").first();
  await expect(grid.getByRole("heading", { level: 3 }).nth(0)).toHaveText(
    "Pest infestation",
  );
  await expect(grid.getByRole("heading", { level: 3 }).nth(1)).toHaveText(
    "Disease symptoms",
  );
  for (const [width, columns] of [
    [390, 1],
    [800, 2],
    [1400, 3],
  ]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await grid.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
    ).toBe(columns);
  }
  expect(await grid.evaluate((el) => getComputedStyle(el).listStyleType)).toBe(
    "none",
  );

  await page.getByRole("button", { name: "View detailed analysis" }).click();
  for (const dimension of ["year", "season", "crop", "field"]) {
    await page.getByLabel("Group results by").selectOption(dimension);
    await expect(
      page.getByRole("table", {
        name: `${dimension}-wise measured post-harvest outcomes`,
      }),
    ).toContainText("₹15,000");
  }
  await page.reload();
  await page.getByLabel("Existing harvested lot").selectOption(lotId);
  await expect(
    page.getByLabel(/I verified same-unit price and actual damaged recovery/),
  ).toBeChecked();
  await page
    .getByLabel("Notes", { exact: true })
    .fill("ISOLATED TEST note-only correction");
  await page.getByLabel(/I confirm measured quantities/).check();
  const noteSave = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/crop-loss") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save corrected allocation" }).click();
  expect((await (await noteSave).json()).monetaryLoss).toBe("15000.00");
  const lot = await db.production.findUniqueOrThrow({
    where: { id: lotId },
    include: { lossAssessment: true },
  });
  expect(lot.quantity.toString()).toBe("50");
  expect(lot.unit).toBe("quintal");
  expect(lot.lossAssessment!.priceConfirmed).toBe(true);
  expect(lot.lossAssessment!.priceEvidence).toContain("ISOLATED TEST");
  await page
    .getByLabel("Full-quality INR per quintal", { exact: true })
    .fill("2501");
  await expect(
    page.getByLabel(/I verified same-unit price and actual damaged recovery/),
  ).not.toBeChecked();
  await expect(page.locator("#crop-loss-valuation-status")).toContainText(
    "Missing valuation attestation",
  );
  await page.route("**/api/crop-loss/prevention", (route) =>
    route.abort("internetdisconnected"),
  );
  await page
    .context()
    .addCookies([
      { name: "agritrack_locale", value: "hi", domain: "127.0.0.1", path: "/" },
    ]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "कटाई का सार" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "जोखिम की जाँच" }),
  ).toBeVisible();
  await expect(
    page.getByText("ऑफ़लाइन कृषि सलाह", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".harvest-loss-metrics")).toContainText("₹15,000");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
