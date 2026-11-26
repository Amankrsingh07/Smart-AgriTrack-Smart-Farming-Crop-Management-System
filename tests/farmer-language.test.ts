import { farmerAdviceLabels } from "../src/i18n/farmer-advice-labels";
import test from "node:test";
import assert from "node:assert/strict";
import {
  adviceSections,
  farmerTerm,
  farmerTerms,
} from "../src/i18n/farmer-terms";
import { languages } from "../src/i18n/languages";
import { farmerMessageOverrides } from "../src/i18n/farmer-message-overrides";
import { parseFarmerAdvice } from "../src/lib/farmer-advice";
import { soilText } from "../src/i18n/soil-health";

test("each existing locale has distinct offline terms and distinct advice headings", () => {
  for (const { code } of languages) {
    assert.equal(farmerTerms[code].length, farmerTerms.en.length);
    assert.ok(farmerTerms[code].every((term) => term.trim().length > 0));
    if (code !== "en")
      assert.ok(
        farmerTerms[code].every(
          (term, index) => String(term) !== farmerTerms.en[index],
        ),
      );
    assert.equal(
      new Set(adviceSections.map((heading) => farmerTerm(code, heading))).size,
      4,
    );
    assert.equal(new Set(farmerAdviceLabels(code)).size, 4);
    if (code !== "en")
      assert.notDeepEqual(farmerAdviceLabels(code), farmerAdviceLabels("en"));
    assert.equal(soilText(code, "20 kg/ha"), "20 kg/ha");
    assert.equal(soilText(code, "K2O"), "K2O");
  }
});

test("advice sections preserve text, units and warnings, and reject incomplete output", () => {
  const data = {
    situation: "20 kg/ha",
    possibleCauses: "Unknown",
    nextSteps: ["Check the label.", "Record what you see."],
    expertHelp: "Ask the KVK.",
    details: "Reference data.",
  };
  const advice = parseFarmerAdvice(JSON.stringify(data), "hi");
  assert.equal(advice.sections.length, 3);
  assert.equal(advice.sections[0].text, "20 kg/ha");
  assert.equal(advice.sections[0].title, "क्या दिक्कत है?");
  assert.match(advice.sections[2].text, /Ask the KVK/);
  assert.equal(advice.details, data.details);
  assert.throws(() =>
    parseFarmerAdvice(JSON.stringify({ situation: "Possible" }), "hi"),
  );
  for (const patch of [
    { nextSteps: [] },
    { nextSteps: Array(6).fill("Check.") },
    { situation: "x".repeat(221) },
    { expertHelp: "Long\nparagraph" },
  ]) {
    assert.throws(() =>
      parseFarmerAdvice(JSON.stringify({ ...data, ...patch }), "hi"),
    );
  }
});

test("catalog reuse retains existing ICU placeholders", () => {
  assert.deepEqual(
    farmerMessageOverrides(
      "hi",
      { entry: "मात्रा {value} kg/ha" },
      { entry: "Amount {value} kg/ha" },
      true,
    ),
    { entry: "मात्रा {value} kg/ha" },
  );
  assert.equal(
    farmerMessageOverrides("ta", {}, { absent: "Source {value}" }, true).absent,
    "Source {value}",
  );
});

test("scientific warnings remain outside the optional details", async () => {
  const { createElement } = await import("react");
  const { renderSoil } = await import("./helpers/soil-render");
  const { default: FarmerAdviceCard } =
    await import("../src/app/(app)/farmer-advice-card");
  const html = renderSoil(
    createElement(FarmerAdviceCard, {
      locale: "bn",
      problem: "Insufficient information",
      reason: "No laboratory report",
      actions: ["Check the field", "Record symptoms"],
      warning: "A photo cannot confirm disease.",
      details: "Source reference · 20 kg/ha",
    }),
  );
  assert.equal((html.match(/<h3>/g) ?? []).length, 3);
  assert.match(html, /A photo cannot confirm disease\.<\/div><details>/);
  assert.match(
    html,
    /<summary>আরও তথ্য দেখুন<\/summary>Source reference · 20 kg\/ha/,
  );
});
