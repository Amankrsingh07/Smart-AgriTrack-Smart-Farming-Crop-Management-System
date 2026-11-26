import assert from "node:assert/strict";
import { test } from "node:test";
import { answerWithGemini } from "../src/lib/assistant-gemini";
import {
  assistantDisplayText,
  assistantFieldHistory,
  boundedAssistantHistory,
  type AssistantHistoryItem,
} from "../src/lib/assistant-chat";
import { loadOfflineForecast } from "../src/lib/open-meteo";
import {
  assistantForecastDays,
  assistantReplyLocale,
  forecastSource,
  maizeIrrigation,
  offlineAssistantAnswer,
  resolveAssistantQuestion,
} from "../src/lib/assistant-knowledge";

const questions = [
  "मक्का में पानी का उपयोग कैसे घटाऊँ?",
  "KVK से क्यों पूछें? तुम ही बता दो।",
  "अगर अगले दो दिन बारिश होगी तो पानी देना चाहिए?",
  "मेरी मक्का की फसल अभी फूल आने की अवस्था में है।",
];

test("offline Hindi turns stay on maize, answer KVK directly, use rainfall evidence and adapt to flowering", () => {
  const history: AssistantHistoryItem[] = [];
  const answers = questions.map((question, index) => {
    const resolved = resolveAssistantQuestion(question, history);
    assert.equal(resolved.crop, "maize");
    assert.ok(resolved.intents.includes("irrigation"));
    const evidence =
      index === 2
        ? {
            hasField: true,
            moisture: { date: "2026-11-24", percent: 19 },
            forecast: [
              { date: "2026-11-25", rainMm: 3, rainChancePercent: 60 },
              { date: "2026-11-26", rainMm: 0, rainChancePercent: 5 },
            ],
          }
        : {};
    const reply = offlineAssistantAnswer(
      resolved,
      evidence,
      assistantReplyLocale(question, "en"),
    );
    history.push(
      { role: "USER", content: question },
      { role: "ASSISTANT", content: reply.answer },
    );
    return reply;
  });
  assert.match(answers[0].answer, /ड्रिप/);
  assert.doesNotMatch(answers[0].answer, /KVK|कीट|कटाई/);
  assert.deepEqual(answers[0].sources, [maizeIrrigation.source]);
  assert.match(answers[1].answer, /खेत की जाँच.*KVK/);
  assert.notEqual(answers[0].answer, answers[1].answer);
  assert.match(answers[2].answer, /2026-11-25 · 3 मिमी.*60%/);
  assert.match(answers[2].answer, /2026-11-26 · 0 मिमी/);
  assert.match(answers[2].answer, /दर्ज नमी 19%/);
  assert.deepEqual(answers[2].sources, [forecastSource]);
  assert.match(answers[3].answer, /फूल.*कम दाने/);
  assert.doesNotMatch(answers[3].answer, /बारिश का ताज़ा अनुमान/);
  assert.deepEqual(answers[3].sources, [maizeIrrigation.source]);
});

test("absent rain and moisture are explicit, saved stage applies, and unrelated topics don't inherit maize irrigation", () => {
  const history = [
    { role: "USER", content: "How can I reduce water use in corn?" },
  ];
  const missing = offlineAssistantAnswer(
    resolveAssistantQuestion("Should I irrigate if rain is expected?", history),
    { hasField: true },
    "en",
  );
  assert.match(missing.answer, /don’t have a live rainfall forecast/);
  assert.match(missing.answer, /don’t have a saved moisture reading/);
  assert.doesNotMatch(missing.answer, /\d+ (mm|%)/);
  assert.deepEqual(missing.sources, []);
  const flowering = offlineAssistantAnswer(
    resolveAssistantQuestion("Should I water?", [], "maize", "Flowering"),
    {},
    "en",
  );
  assert.match(flowering.answer, /grain set/);
  const market = offlineAssistantAnswer(
    resolveAssistantQuestion("What is the market price for maize?", history),
    {},
    "en",
  );
  assert.doesNotMatch(market.answer, /irrigation|soil|TNAU/);
  assert.equal(
    resolveAssistantQuestion(
      "What about wheat flowering now?",
      history,
      "Maize",
    ).fieldMatches,
    false,
  );
  assert.deepEqual(
    resolveAssistantQuestion(
      "What fertilizer should I use for wheat and when can I harvest?",
      history,
    ).intents,
    ["nutrition", "harvest"],
  );
});

test("history survives chat reload but excludes turns from a prior field, including another field of the same crop", () => {
  const turns = [
    { role: "USER", content: questions[0], advice: { cropCycleId: "field-a" } },
    { role: "ASSISTANT", content: "First answer" },
    {
      role: "USER",
      content: "What is the soil health report?",
      advice: { cropCycleId: "field-b" },
    },
    { role: "ASSISTANT", content: "Second answer" },
  ];
  const history = assistantFieldHistory(turns, "field-b", false);
  assert.deepEqual(history, turns.slice(2));
  assert.deepEqual(assistantFieldHistory(turns, "field-c", true), []);
  assert.deepEqual(
    resolveAssistantQuestion("Can you tell me instead?", history).intents,
    ["nutrition"],
  );
  assert.equal(
    assistantDisplayText("svg\n• svg\n<svg width='12'>\n</svg>\nसिंचाई देखें"),
    "सिंचाई देखें",
  );
});

test("Gemini receives all four turns and field evidence, restricts sources, and falls back on an echoed answer or outage", async (t) => {
  const history: AssistantHistoryItem[] = [];
  const field = {
    forecast: [{ date: "2026-11-25", rainMm: 3 }],
    latestSavedMoisture: { date: "2026-11-24", percent: 19 },
  };
  const replies = [
    "सिंचाई से पहले नमी देखें।",
    "आप खेत में यह जाँच कर सकते हैं।",
    "बारिश का अनुमान देखें और मिट्टी जाँचें।",
    "फूल आने पर जड़ों की नमी बनाए रखें।",
  ];
  let call = 0;
  let failure = false;
  let echo = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      if (failure) return Response.json({}, { status: 503 });
      const body = JSON.parse(String(init.body));
      const turns = body.contents;
      assert.deepEqual(turns.slice(0, -1), boundedAssistantHistory(history));
      const current = JSON.parse(turns.at(-1).parts[0].text);
      assert.deepEqual(current.selectedCropContext, field);
      assert.equal(current.question, questions[call] ?? questions[3]);
      const usedSourceIds = [call === 2 ? "2" : "1", "invented"];
      const response = {
        situation: replies[echo ? 3 : call],
        possibleCauses: "मिट्टी की नमी से फैसला बदलता है।",
        nextSteps: ["जड़ों की मिट्टी देखें।", "जरूरत पर पानी दें।"],
        expertHelp: "पानी खड़ा न होने दें।",
        usedSourceIds,
      };
      return Response.json({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(response) }] } },
        ],
      });
    },
  );
  const ask = (question: string) =>
    answerWithGemini({
      apiKey: "mocked",
      model: "mocked",
      locale: "hi",
      question,
      history: boundedAssistantHistory(history),
      field,
      resolved: resolveAssistantQuestion(question, history),
      guidance: offlineAssistantAnswer(
        resolveAssistantQuestion(question, history),
        {},
        "hi",
      ).answer,
      sources: [maizeIrrigation.source, forecastSource],
    });
  for (const question of questions) {
    const result = await ask(question);
    assert.ok(result.answer?.includes(replies[call]));
    assert.deepEqual(result.sources, [
      call === 2 ? forecastSource : maizeIrrigation.source,
    ]);
    history.push(
      { role: "USER", content: question },
      { role: "ASSISTANT", content: result.answer! },
    );
    call++;
  }
  echo = true;
  history[history.length - 2].content = "पिछला सवाल";
  assert.equal((await ask(questions[3])).onlineIssue, "REPEATED_RESPONSE");
  failure = true;
  assert.equal((await ask(questions[3])).onlineIssue, "PROVIDER_UNAVAILABLE");
});

test("forecast selection covers tomorrow and the following day and excludes demo weather", () => {
  const demo = loadOfflineForecast();
  assert.deepEqual(assistantForecastDays(demo, "2026-11-24", questions[2]), []);
  const forecast = {
    ...demo,
    demo: undefined,
    daily: {
      ...demo.daily,
      time: ["2026-11-24", "2026-11-25", "2026-11-26"],
      precipitation_sum: [10, 0, null],
      precipitation_probability_max: [75, 0, 50],
    },
  };
  const result = assistantForecastDays(forecast, "2026-11-24", questions[2]);
  assert.deepEqual(
    result.map(({ date, rainMm, rainChancePercent }) => ({
      date,
      rainMm,
      rainChancePercent,
    })),
    [
      { date: "2026-11-25", rainMm: 0, rainChancePercent: 0 },
      { date: "2026-11-26", rainMm: null, rainChancePercent: 50 },
    ],
  );
});

test("saved market quotes, expenses and crop-specific irrigation references stay scoped to the question", () => {
  const field = {
    expenseTotal: "100.00",
    marketQuote: {
      date: "2026-11-23",
      mandi: "Test Mandi",
      price: "1200",
      unit: "quintal",
    },
  };
  const price = offlineAssistantAnswer(
    resolveAssistantQuestion("What is today's market price?"),
    field,
    "en",
  );
  assert.match(price.answer, /1200.*2026-11-23/);
  assert.doesNotMatch(price.answer, /100.00/);
  const expenses = offlineAssistantAnswer(
    resolveAssistantQuestion("What are my crop expenses?"),
    field,
    "en",
  );
  assert.match(expenses.answer, /100.00/);
  assert.doesNotMatch(expenses.answer, /1200/);
  const wheat = offlineAssistantAnswer(
    resolveAssistantQuestion("How should I irrigate wheat?"),
    {},
    "en",
  );
  assert.match(wheat.answer, /first roots/);
  assert.doesNotMatch(wheat.sources[0].url, /maize/);
});

test("automatic routing prefers supported offline answers and requests Gemini once for unsupported questions", async () => {
  const { chooseAssistantAnswer, hasReliableOfflineAnswer } =
    await import("../src/lib/assistant-knowledge");
  const field = { hasField: true };
  const opening = "मक्का में पानी कैसे बचाएँ?";
  const rain = "और अगर बारिश हो जाए?";
  const history = [
    { role: "USER", content: opening },
    { role: "USER", content: rain },
  ];
  let calls = 0;
  const askGemini = async () => {
    calls++;
    return { answer: "Gemini answer" };
  };
  for (const question of [
    opening,
    rain,
    "KVK से क्यों पूछूँ? आप ही बताइए।",
    "Makka mein paani kaise bachayein?",
  ]) {
    const resolved = resolveAssistantQuestion(
      question,
      question === rain ? history.slice(0, 1) : history,
      "Maize",
    );
    assert.equal(
      await chooseAssistantAnswer(
        hasReliableOfflineAnswer(question, resolved, field),
        false,
        askGemini,
      ),
      null,
      question,
    );
    assert.match(
      offlineAssistantAnswer(
        resolved,
        field,
        assistantReplyLocale(question, "en"),
      ).answer,
      /मक्का|सिंचाई|मिट्टी/,
    );
  }
  assert.equal(calls, 0);
  for (const question of [
    "How do I intercrop beans?",
    "How can I reduce water pollution in maize?",
    "How much water for maize?",
    "My maize leaves are yellow; is it disease?",
    "Explain why that works.",
  ]) {
    const resolved = resolveAssistantQuestion(question, history, "Maize");
    assert.deepEqual(
      await chooseAssistantAnswer(
        hasReliableOfflineAnswer(question, resolved, field),
        false,
        askGemini,
      ),
      { answer: "Gemini answer" },
      question,
    );
  }
  assert.equal(calls, 5);
  assert.deepEqual(
    await chooseAssistantAnswer(false, true, async () => ({
      onlineIssue: "REQUEST_TIMEOUT",
    })),
    { onlineIssue: "REQUEST_TIMEOUT" },
  );
});

test("provider failures return a bounded issue and safe fallback excludes unrelated advice", async (t) => {
  const { safeOfflineAfterFailure } =
    await import("../src/lib/assistant-knowledge");
  const question = "How can I reduce water pollution in maize?";
  const resolved = resolveAssistantQuestion(question, [], "Maize");
  const options = {
    model: "mocked",
    locale: "en",
    question,
    history: [],
    field: { crop: "Maize" },
    resolved,
    guidance: "",
    sources: [],
  };
  assert.equal((await answerWithGemini(options)).onlineIssue, "NOT_CONFIGURED");
  const failures = [
    [
      () =>
        Response.json(
          { error: { details: [{ reason: "API_KEY_INVALID" }] } },
          { status: 400 },
        ),
      "INVALID_KEY",
    ],
    [() => Response.json({}, { status: 429 }), "QUOTA_OR_RATE_LIMIT"],
    [() => Response.json({}, { status: 503 }), "PROVIDER_UNAVAILABLE"],
    [
      () => {
        throw new TypeError("offline");
      },
      "NETWORK_FAILURE",
    ],
    [
      () => {
        throw new DOMException("timed out", "TimeoutError");
      },
      "REQUEST_TIMEOUT",
    ],
  ] as const;
  for (const [failure, expected] of failures) {
    const fetch = t.mock.method(globalThis, "fetch", async () => failure());
    assert.equal(
      (await answerWithGemini({ ...options, apiKey: "mocked" })).onlineIssue,
      expected,
    );
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
  const fallback = safeOfflineAfterFailure(question, resolved, {}, "en", []);
  assert.match(fallback.answer, /unavailable/);
  assert.doesNotMatch(fallback.answer, /Check moisture|drip/);
  assert.deepEqual(fallback.sources, []);
  const partialQuestion =
    "How can I save water in maize and what disease causes leaf spots?";
  const partial = safeOfflineAfterFailure(
    partialQuestion,
    resolveAssistantQuestion(partialQuestion),
    {},
    "en",
    [],
  );
  assert.match(partial.answer, /Check moisture/);
  assert.deepEqual(partial.sources, [maizeIrrigation.source]);
});

test("online assistant retries a transient Gemini failure once and skips retry for quota", async (t) => {
  const { answerAssistantOnline, defaultAssistantGeminiModel } =
    await import("../src/lib/assistant-gemini");
  const calls: string[] = [];
  let quota = false;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(url);
    return Response.json({}, { status: quota ? 429 : 503 });
  });
  const options = {
    apiKey: "mocked",
    model: "custom-model",
    locale: "en",
    question: "How do I intercrop beans?",
    history: [],
    field: null,
    resolved: null,
    guidance: "",
    sources: [],
  };
  assert.equal(
    (await answerAssistantOnline(options)).onlineIssue,
    "PROVIDER_UNAVAILABLE",
  );
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes(defaultAssistantGeminiModel));
  quota = true;
  assert.equal(
    (await answerAssistantOnline(options)).onlineIssue,
    "QUOTA_OR_RATE_LIMIT",
  );
  assert.equal(calls.length, 3);
});

test("Gemini retry returns a validated answer after a transient error", async (t) => {
  const { answerAssistantOnline, defaultAssistantGeminiModel } =
    await import("../src/lib/assistant-gemini");
  let attempts = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, request: RequestInit) => {
      const { generationConfig } = JSON.parse(String(request.body));
      if (++attempts === 1) {
        assert.equal(generationConfig.responseMimeType, "application/json");
        return Response.json({}, { status: 503 });
      }
      assert.equal(generationConfig.responseMimeType, "application/json");
      const text = JSON.stringify({
        situation: "Use a field-specific plan.",
        possibleCauses: "The layout affects spacing.",
        nextSteps: ["Check available land.", "Mark the rows."],
        expertHelp: "Check drainage.",
      });
      return Response.json({
        candidates: [{ content: { parts: [{ text }] } }],
      });
    },
  );
  const result = await answerAssistantOnline({
    apiKey: "mocked",
    model: defaultAssistantGeminiModel,
    locale: "en",
    question: "How do I intercrop beans?",
    history: [],
    field: null,
    resolved: null,
    guidance: "",
    sources: [],
  });
  assert.match(result.answer ?? "", /Mark the rows/);
  assert.equal(attempts, 2);
});
