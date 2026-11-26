import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldAdvice,
  fieldRain,
  savedProtectionRisks,
  type FieldAdviceContext,
} from "../src/lib/field-advice";
import { fieldAdviceText } from "../src/i18n/crop-advice/field";
import { languages } from "../src/i18n/languages";
import { agriculturalKnowledge } from "../src/lib/agricultural-knowledge";
import { loadOfflineForecast } from "../src/lib/open-meteo";
import { explainSoilReference } from "../src/lib/soil-advice-online";
import { savedCropSoilAdvice } from "../src/lib/saved-crop-soil-advice";

const today = "2026-11-20";
const field: FieldAdviceContext = {
  crop: "Rice (Paddy)",
  status: "ACTIVE",
  today,
  stage: "Maturity",
  harvest: today,
  harvested: false,
  soilSample: null,
  hasCoordinates: false,
  rain: null,
  calendar: today,
  irrigation: today,
  fertilizer: null,
  fertilizerRecord: null,
  protection: null,
  protectionConcern: false,
  loss: null,
};

test("offline advice prioritizes due checks, preserves missing data and localizes every action", () => {
  const offline = fieldAdvice(field);
  assert.equal(offline.image, "rice");
  const due = offline.tasks
    .filter((task) => task.priority !== null)
    .sort((a, b) => Number(a.priority) - Number(b.priority));
  assert.deepEqual(
    due.map((task) => task.topic),
    ["harvest", "irrigation", "calendar", "protection"],
  );
  assert.equal(
    offline.tasks.find((task) => task.topic === "weather")?.message,
    "locationMissing",
  );
  assert.equal(
    offline.tasks.find((task) => task.topic === "fertilizer")?.message,
    "needSoilReport",
  );
  for (const language of languages.slice(1)) {
    for (const task of offline.tasks) {
      assert.notEqual(
        fieldAdviceText(language.code, task.topic),
        fieldAdviceText("en", task.topic),
      );
      assert.notEqual(
        fieldAdviceText(language.code, task.message),
        fieldAdviceText("en", task.message),
      );
    }
  }
});

test("saved protection concern and rain outrank planned operations; completed cycles do not get watering prompts", () => {
  const result = fieldAdvice({
    ...field,
    rain: 3,
    protectionConcern: true,
    loss: today,
    fertilizer: today,
  });
  assert.equal(
    result.tasks.find((task) => task.priority === 0)?.message,
    "safetyReview",
  );
  assert.equal(
    result.tasks.find((task) => task.priority === 1)?.message,
    "rainReview",
  );
  assert.equal(
    fieldAdvice({ ...field, exposedRainDate: today }).tasks.find(
      (task) => task.priority === 3,
    )?.message,
    "rainLoss",
  );
  const finished = fieldAdvice({ ...field, status: "HARVESTED", loss: today });
  assert.deepEqual(
    finished.tasks
      .filter((task) => task.priority !== null)
      .map((task) => task.topic),
    ["loss"],
  );
  assert.equal(
    finished.tasks.find((task) => task.topic === "irrigation")?.message,
    "pastRecords",
  );
});

test("forecast date matching preserves zero and represents unavailable data explicitly", () => {
  const fixture = loadOfflineForecast();
  delete fixture.demo; // Simulate a provider forecast for this date-matching test.
  fixture.daily.time = ["2026-11-19", today, "2026-11-21"];
  fixture.daily.precipitation_sum = [10, 0, null];
  assert.equal(fieldRain(fixture, today), 0);
  assert.equal(fieldRain(fixture, "2026-11-21"), null);
  assert.equal(fieldRain(fixture, "2026-11-22"), null);
  assert.equal(fieldRain(null, today), null);
});

test("saved protection risks use only crop-matched identifiers in the bundled reference", () => {
  const record = agriculturalKnowledge.records.find(
    (row) =>
      row.verificationStatus === "SOURCE_LINKED_SCREENING" &&
      /pest|fungal|bacterial|viral|oomycete|insect/i.test(row.category),
  )!;
  const findings = {
    topSuspects: [
      { id: record.id, name: "Unverified name" },
      { id: "invented" },
    ],
  };
  assert.deepEqual(savedProtectionRisks(record.crops[0], findings), [
    { name: record.name, source: record.source, reviewed: record.lastReviewed },
  ]);
  assert.deepEqual(savedProtectionRisks("Unrelated crop", findings), []);
});

test("Gemini can select approved sentences but cannot add even a nonnumeric diagnosis", async () => {
  const input = {
    crop: "Wheat",
    soil: "Loam",
    state: "Bihar",
    district: "Saran",
    ph: null,
    texture: null,
  };
  const reference = savedCropSoilAdvice(input);
  const approvedTips = [
    fieldAdviceText("hi", "soilCheck"),
    fieldAdviceText("hi", "needSoilReport"),
  ];
  const reply = (tips: string[]) => async () =>
    Response.json({
      candidates: [
        { content: { parts: [{ text: JSON.stringify({ tips }) }] } },
      ],
    });
  assert.deepEqual(
    (
      await explainSoilReference(
        input,
        reference,
        "key",
        "model",
        reply(approvedTips),
        "hi",
        approvedTips,
      )
    ).tips,
    approvedTips,
  );
  await assert.rejects(
    explainSoilReference(
      input,
      reference,
      "key",
      "model",
      reply([approvedTips[0], "Your crop has a severe fungal infection."]),
      "hi",
      approvedTips,
    ),
  );
});
