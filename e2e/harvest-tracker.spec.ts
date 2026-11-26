import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac, randomUUID } from "node:crypto";
import { dateOnlyInIndia } from "../src/lib/crop-cycle-status";
import { requireTestDatabase } from "../src/lib/test-database-safety";

const db = new PrismaClient({
  datasourceUrl: requireTestDatabase(process.env.TEST_DATABASE_URL),
});

test.afterAll(async () => db.$disconnect());

test("tracks owned crop cycles, refreshes after changes, and separates mobile empty, offline, and error states", async ({
  page,
  context,
}) => {
  const tag = randomUUID();
  const emails = [`tracker-${tag}@example.test`, `other-${tag}@example.test`];
  const cropName = `Tracker test crop ${tag}`;
  try {
    const [owner, other] = await Promise.all(
      emails.map((email) =>
        db.user.create({
          data: {
            name: "Tracker Tester",
            email,
            passwordHash: "test-only",
            language: "en",
          },
        }),
      ),
    );
    const crop = await db.crop.create({
      data: {
        name: cropName,
        seasons: "RABI",
        soilTypes: "Alluvial",
        waterNeed: "MEDIUM",
      },
    });
    const fields = await Promise.all(
      [owner, other].map(async (user) => {
        const farm = await db.farm.create({
          data: {
            userId: user.id,
            name: "Tracker Farm",
            state: "Bihar",
            district: "Saran",
          },
        });
        return db.field.create({
          data: {
            farmId: farm.id,
            name: "Tracker Field",
            area: 2,
            soilType: "Alluvial",
            irrigationMethod: "Drip",
          },
        });
      }),
    );
    const today = dateOnlyInIndia(new Date());
    const day = (offset: number) =>
      new Date(today.getTime() + offset * 86_400_000);
    const create = (
      fieldId: string,
      options: Partial<
        Pick<
          import("@prisma/client").Prisma.CropCycleUncheckedCreateInput,
          | "season"
          | "status"
          | "sowingDate"
          | "expectedHarvestDate"
          | "cropDurationDays"
          | "actualHarvestDate"
        >
      >,
    ) =>
      db.cropCycle.create({
        data: { fieldId, cropId: crop.id, season: "RABI", ...options },
      });
    const foreign = await create(fields[1].id, {
      status: "ACTIVE",
      expectedHarvestDate: day(3),
    });
    const payload = Buffer.from(
      JSON.stringify({ userId: owner.id, exp: Date.now() + 3_600_000 }),
    ).toString("base64url");
    const signature = createHmac(
      "sha256",
      "isolated-soil-tests-only-32-characters-minimum",
    )
      .update(payload)
      .digest("hex");
    await context.addCookies([
      {
        name: "agritrack_session",
        value: `${payload}.${signature}`,
        url: "http://127.0.0.1:3107",
      },
    ]);
    await page.setViewportSize({ width: 375, height: 812 });

    let fail = true;
    await page.route("**/api/harvests", (route) =>
      route.request().method() === "GET" && fail
        ? route.fulfill({ status: 503, json: {} })
        : route.continue(),
    );
    await page.goto("/dashboard");
    const tracker = page.locator(".harvest-tracker");
    await expect(
      tracker.getByText("Could not load harvest tracking."),
    ).toBeVisible();
    await expect(tracker.getByText("Live tracking")).toHaveCount(0);
    fail = false;
    await tracker.getByRole("button", { name: "Retry" }).click();
    await expect(
      tracker.getByText("No active crop available for harvest tracking."),
    ).toBeVisible();

    const additionalField = await db.field.create({
      data: {
        farmId: fields[0].farmId,
        name: "Second Tracker Field",
        area: 2,
        soilType: "Alluvial",
        irrigationMethod: "Drip",
      },
    });
    const [upcoming, estimated, incomplete, overdue, finished] =
      await Promise.all([
        create(fields[0].id, {
          status: "ACTIVE",
          sowingDate: day(-20),
          expectedHarvestDate: day(15),
          cropDurationDays: 30,
        }),
        create(additionalField.id, {
          status: "ACTIVE",
          sowingDate: day(-36),
          cropDurationDays: 40,
        }),
        create(fields[0].id, { status: "PLANNED", season: "KHARIF" }),
        create(fields[0].id, {
          status: "ACTIVE",
          expectedHarvestDate: day(-3),
          season: "ZAID",
        }),
        create(fields[0].id, {
          status: "COMPLETED",
          actualHarvestDate: day(-2),
        }),
      ]);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("agritrack:harvest-updated")),
    );
    const cards = tracker.locator(".harvest-tracker-card");
    await expect(cards).toHaveCount(4);
    for (const [cycle, label] of [
      [upcoming, "Upcoming"],
      [estimated, "Ready soon"],
      [overdue, "Overdue"],
    ] as const) {
      const card = cards.filter({
        has: page.locator(`a[href="/crops#cycle-${cycle.id}"]`),
      });
      await expect(card.locator(".harvest-status-pill")).toHaveText(label);
    }
    const edit = tracker.getByRole("link", { name: "Edit Crop Details" });
    await expect(edit).toHaveAttribute(
      "href",
      `/crops?edit=${incomplete.id}#cycle-${incomplete.id}`,
    );
    const api = await page.request.get("/api/harvests");
    const data: { crops: Array<{ id: string; status: string }> } =
      await api.json();
    expect(data.crops.some((c) => c.id === foreign.id)).toBe(false);
    expect(data.crops.find((c) => c.id === finished.id)?.status).toBe(
      "HARVESTED",
    );

    const center = await context.newPage();
    await center.goto(`/harvests?cropCycleId=${upcoming.id}`);
    await expect(center.locator(`#harvest-${finished.id}`)).toBeVisible();
    const form = center.locator(`#harvest-${upcoming.id} form`);
    await form.locator('input[name="quantity"]').fill("25");
    await form.getByRole("button", { name: "Mark as harvested" }).click();
    await expect(cards).toHaveCount(3);
    await expect(
      center.locator(`#harvest-${upcoming.id} .harvest-status-pill`),
    ).toHaveText("Harvested");
    await center.close();

    expect(
      await db.production.count({ where: { cropCycleId: upcoming.id } }),
    ).toBe(1);

    const cropPage = await context.newPage();
    await cropPage.goto(`/crops?edit=${incomplete.id}#cycle-${incomplete.id}`);
    await expect(
      cropPage.locator(`#cycle-${incomplete.id} details`),
    ).toHaveAttribute("open", "");
    const editForm = cropPage.locator(`#cycle-${incomplete.id} details form`);
    await editForm
      .locator('input[name="expectedHarvestDate"]')
      .fill(day(2).toISOString().slice(0, 10));
    await editForm.getByRole("button", { name: "Save changes" }).click();
    await expect(cropPage).toHaveURL(
      (url) => url.searchParams.get("saved") === "Crop cycle updated",
    );
    await expect(edit).toHaveCount(0);
    cropPage.once("dialog", (dialog) => dialog.accept());
    await cropPage
      .locator(`#cycle-${overdue.id}`)
      .getByRole("button", { name: "Delete crop cycle" })
      .click();
    await expect(cropPage).toHaveURL(
      (url) => url.searchParams.get("saved") === "Crop cycle deleted",
    );
    await expect(cards).toHaveCount(2);
    const addForm = cropPage.locator("#add-crop");
    await addForm.locator('select[name="fieldId"]').selectOption(fields[0].id);
    await addForm.locator("#cropId").selectOption(crop.id);
    await addForm.locator('select[name="season"]').selectOption("ZAID");
    await addForm
      .locator('input[name="sowingDate"]')
      .fill(day(-5).toISOString().slice(0, 10));
    await addForm
      .locator('input[name="expectedHarvestDate"]')
      .fill(day(14).toISOString().slice(0, 10));
    await addForm.getByRole("button", { name: "Save crop cycle" }).click();
    await expect(cropPage).toHaveURL(
      (url) => url.searchParams.get("saved") === "Crop cycle created",
    );
    await expect(cards).toHaveCount(3);
    await cropPage.close();

    const mobile = await tracker.evaluate((element) => {
      const link = element.querySelector('a[href="/harvests"]')!;
      return {
        overflow: element.scrollWidth > element.clientWidth,
        linkDisplay: getComputedStyle(link).display,
        alignment: getComputedStyle(link).alignItems,
      };
    });
    expect(mobile).toEqual({
      overflow: false,
      linkDisplay: "inline-flex",
      alignment: "center",
    });

    await context.setOffline(true);
    await expect(tracker.getByText(/You’re offline/)).toBeVisible();
    await expect(tracker.getByText("Live tracking")).toHaveCount(0);
    await context.setOffline(false);
    await expect(tracker.getByText("Live tracking")).toBeVisible();
  } finally {
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.crop.deleteMany({ where: { name: cropName } });
  }
});
