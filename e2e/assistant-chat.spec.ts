import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { requireTestDatabase } from "../src/lib/test-database-safety";

const db = new PrismaClient({
  datasourceUrl: requireTestDatabase(process.env.TEST_DATABASE_URL),
});
const tag = randomUUID();
const password = "AssistantChatTest123!";
const users = [
  { email: `assistant-owner-${tag}@example.test`, name: "Assistant Owner" },
  { email: `assistant-other-${tag}@example.test`, name: "Assistant Other" },
];
let userIds: string[] = [];
let cycleIds: string[] = [];
let cropIds: string[] = [];

test.beforeAll(async () => {
  const createdUsers = await Promise.all(
    users.map((user) =>
      db.user.create({ data: { ...user, passwordHash: "", language: "en" } }),
    ),
  );
  userIds = createdUsers.map((user) => user.id);
  const farm = await db.farm.create({
    data: {
      userId: userIds[0],
      name: "ISOLATED Assistant Farm",
      state: "Bihar",
      district: "Saran",
    },
  });
  const field = await db.field.create({
    data: {
      farmId: farm.id,
      name: "ISOLATED Assistant Field",
      area: 1,
      soilType: "Alluvial",
      irrigationMethod: "Surface",
    },
  });
  const crops = await Promise.all(
    ["Maize", "Wheat"].map((name) =>
      db.crop.create({
        data: {
          name: `${name} Assistant ${tag}`,
          seasons: "KHARIF,RABI",
          soilTypes: "Alluvial",
          waterNeed: "MEDIUM",
          illustrative: false,
        },
      }),
    ),
  );
  cropIds = crops.map((crop) => crop.id);
  const cycles = await Promise.all(
    crops.map((crop, index) =>
      db.cropCycle.create({
        data: {
          fieldId: field.id,
          cropId: crop.id,
          season: index ? "RABI" : "KHARIF",
          status: "ACTIVE",
        },
      }),
    ),
  );
  cycleIds = cycles.map((cycle) => cycle.id);
  await db.user.updateMany({
    where: { id: { in: userIds } },
    data: { passwordHash: await hash(password, 4) },
  });
});

test.afterAll(async () => {
  if (userIds.length)
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  if (cropIds.length)
    await db.crop.deleteMany({ where: { id: { in: cropIds } } });
  await db.$disconnect();
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page
    .locator("form")
    .getByRole("button", { name: /sign in/i })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("continuous turns, crop switching, saved reload, new chat, delete confirmation and private ownership", async ({
  page,
  browser,
}: {
  page: import("@playwright/test").Page;
  browser: Browser;
}) => {
  await signIn(page, users[0].email);
  await page.goto("/assistant");
  const input = page.locator(".assistant-composer textarea");
  const ask = page.locator(".assistant-composer button[type=submit]");
  await page.getByLabel("Saved crop for this chat").selectOption(cycleIds[0]);
  const questions = [
    "What should I check before planting?",
    "How should I check moisture next?",
    "What should I record after that?",
  ];
  for (const question of questions) {
    await input.fill(question);
    await ask.click();
    await expect(page.locator(".assistant-message.user").last()).toContainText(
      question,
    );
    await expect(
      page.locator(".assistant-message.model .assistant-mode-note"),
    ).toHaveCount(questions.indexOf(question) + 1);
  }
  await expect(page.locator(".assistant-mode-note").first()).toContainText(
    "Offline information",
  );
  const conversation = await db.assistantConversation.findFirstOrThrow({
    where: { userId: userIds[0], title: questions[0] },
  });
  expect(
    await db.assistantMessage.count({
      where: { conversationId: conversation.id },
    }),
  ).toBe(6);
  await expect(
    page.getByRole("button", { name: questions[0] }).first(),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: questions[0] }).first().click();
  await expect(page.locator(".assistant-message.user")).toHaveCount(3);
  await expect(
    page.locator(".assistant-message.model .assistant-mode-note"),
  ).toHaveCount(3);

  await page.getByLabel("Saved crop for this chat").selectOption(cycleIds[1]);
  await input.fill("What should I check for this crop?");
  await ask.click();
  await expect
    .poll(
      async () =>
        (
          await db.assistantConversation.findUnique({
            where: { id: conversation.id },
            select: { cropCycleId: true },
          })
        )?.cropCycleId,
    )
    .toBe(cycleIds[1]);

  await page.locator(".assistant-new-chat").click();
  await expect(page.locator(".assistant-message.user")).toHaveCount(0);
  await input.fill("How do I keep a field record?");
  await ask.click();
  await expect(
    page.locator(".assistant-message.model .assistant-mode-note"),
  ).toHaveCount(1);
  const newConversation = await db.assistantConversation.findFirstOrThrow({
    where: { userId: userIds[0], title: "How do I keep a field record?" },
  });

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await signIn(otherPage, users[1].email);
  const privateChat = await otherPage.request.get(
    `/api/assistant/conversations/${conversation.id}`,
  );
  expect(privateChat.status()).toBe(404);
  await otherContext.close();

  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator(
      `.assistant-history-item:has-text("${newConversation.title}") .assistant-history-delete`,
    )
    .click();
  await expect(
    page
      .locator(".assistant-history-item")
      .filter({ hasText: newConversation.title }),
  ).toHaveCount(0);
  expect(
    await db.assistantConversation.findUnique({
      where: { id: newConversation.id },
    }),
  ).toBeNull();
});

test("Hindi maize follow-ups retrieve offline guidance and persist across reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          document.documentElement.dataset.copied = text;
        },
      },
    });
    Object.defineProperty(window.speechSynthesis, "speak", {
      value: (utterance: SpeechSynthesisUtterance) => {
        document.documentElement.dataset.spoken = utterance.text;
        document.documentElement.dataset.speechLanguage = utterance.lang;
      },
    });
  });
  await signIn(page, users[0].email);
  await page.goto("/assistant");
  const questions = [
    "मक्का में पानी का उपयोग कैसे घटाऊँ?",
    "KVK से क्यों पूछें? तुम ही बता दो।",
    "अगर अगले दो दिन बारिश होगी तो पानी देना चाहिए?",
    "मेरी मक्का की फसल अभी फूल आने की अवस्था में है।",
  ];
  const expected = [
    /ड्रिप/,
    /खेत की जाँच.*KVK/,
    /बारिश का ताज़ा अनुमान उपलब्ध नहीं/,
    /कम दाने/,
  ];
  const answers = page.locator(
    ".assistant-message.model .assistant-answer-text",
  );
  for (const [index, question] of questions.entries()) {
    await page.locator(".assistant-composer textarea").fill(question);
    await page.locator(".assistant-composer button[type=submit]").click();
    await expect(answers.nth(index)).toContainText(expected[index]);
  }
  await expect(page.locator(".assistant-mode-note")).toHaveCount(4);
  await expect(page.getByText("ऑफ़लाइन जानकारी", { exact: true })).toHaveCount(
    4,
  );
  await expect(
    page.getByRole("button", { name: "ऑनलाइन फिर कोशिश करें" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "TNAU · Maize irrigation guidance" }),
  ).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Copy", exact: true }),
  ).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Listen", exact: true }),
  ).toHaveCount(4);
  await expect(
    page.locator(".assistant-message-tools button svg").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy", exact: true }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-copied", /ड्रिप/);
  await page
    .getByRole("button", { name: "Listen", exact: true })
    .first()
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-spoken", /ड्रिप/);
  await expect(page.locator("html")).toHaveAttribute(
    "data-speech-language",
    "hi-IN",
  );

  await page.reload();
  await page
    .locator(".assistant-history-open")
    .filter({ hasText: questions[0] })
    .click();
  await expect(answers).toHaveCount(4);
  await expect(answers.last()).toContainText(expected[3]);
  const saved = await db.assistantConversation.findFirstOrThrow({
    where: { userId: userIds[0], title: questions[0] },
  });
  expect(saved.cropCycleId).toBe(cycleIds[0]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(answers.last()).toBeVisible();
  await expect(page.locator(".assistant-composer textarea")).toBeVisible();
});

test("unavailable Gemini can be retried after reload without adding a turn", async ({
  page,
}) => {
  await signIn(page, users[0].email);
  await page.goto("/assistant");
  const question =
    "How do I compare maize drip line pressure and installation costs?";
  await page.locator(".assistant-composer textarea").fill(question);
  await page.locator(".assistant-composer button[type=submit]").click();
  const retry = page.getByRole("button", { name: "Retry Online" });
  await expect(retry).toBeVisible();
  await expect(
    page.getByText(/service configuration needs attention/),
  ).toBeVisible();
  await page.reload();
  await page
    .locator(".assistant-history-open")
    .filter({ hasText: question })
    .click();
  await expect(retry).toBeVisible();
  const retried = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/assistant") &&
      response.request().method() === "POST",
  );
  await retry.click();
  const response = await retried;
  expect(response.status()).toBe(200);
  expect((await response.json()).onlineIssue).toBe("NOT_CONFIGURED");
  await expect(retry).toBeEnabled();
  await expect(page.locator(".assistant-message.user")).toHaveCount(1);
  await expect(
    page
      .locator(".assistant-message.model .assistant-message-tools button")
      .filter({ hasText: "Copy" }),
  ).toHaveCount(1);
  const conversation = await db.assistantConversation.findFirstOrThrow({
    where: { userId: userIds[0], title: question },
  });
  expect(
    await db.assistantMessage.count({
      where: { conversationId: conversation.id },
    }),
  ).toBe(2);
});
