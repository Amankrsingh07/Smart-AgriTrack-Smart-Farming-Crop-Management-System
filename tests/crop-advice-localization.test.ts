import test from "node:test";
import assert from "node:assert/strict";
import translations from "../src/i18n/crop-advice/translations.json";
import source from "../src/i18n/crop-advice/en.json";
import { languages } from "../src/i18n/languages";
import { cropAdviceText, cropAdviceLabel } from "../src/i18n/crop-advice";
import { savedCropSoilAdvice } from "../src/lib/saved-crop-soil-advice";
import { explainSoilReference } from "../src/lib/soil-advice-online";

const catalog = translations as Record<string, Record<string, string>>;
const numbers = (text: string) =>
  [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => match[0]).sort();
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

test("every supported language has complete offline crop text with unchanged quantities and placeholders", () => {
  for (const language of languages.filter((item) => item.code !== "en")) {
    for (const text of source) {
      const translated = catalog[language.code]?.[text];
      assert.ok(translated?.trim(), `Missing ${language.code}: ${text}`);
      assert.deepEqual(
        numbers(translated),
        numbers(text),
        `${language.code} changed numbers: ${text}`,
      );
      assert.deepEqual(
        placeholders(translated),
        placeholders(text),
        `${language.code} changed interpolation: ${text}`,
      );
    }
  }
});

test("saved crop advice localizes actual soil paragraphs and interpolated pH, not just headings", () => {
  for (const language of languages.filter((item) => item.code !== "en")) {
    const input = {
      crop: "Maize",
      soil: "Alluvial",
      state: "Bihar",
      district: "Chhapra",
      ph: 8.1,
      texture: "Loam",
    };
    const english = savedCropSoilAdvice(input);
    const translated = savedCropSoilAdvice(input, language.code);
    for (const key of [
      "summary",
      "texture",
      "drainage",
      "phMessage",
      "regional",
      "testing",
      "nutrientPlan",
      "scope",
    ] as const) {
      assert.notEqual(translated[key], english[key], `${language.code}.${key}`);
      assert.doesNotMatch(translated[key], /\{\w+\}/);
    }
    assert.match(translated.phMessage, /8\.1/);
    assert.notEqual(cropAdviceLabel("ACTIVE", language.code), "ACTIVE");
    assert.notEqual(cropAdviceLabel("RABI", language.code), "RABI");
    assert.notEqual(cropAdviceLabel("Wheat", language.code), "Wheat");
  }
  assert.equal(
    cropAdviceLabel("Family Farm", "hi"),
    "Family Farm",
    "User-entered farm names are preserved",
  );
  assert.equal(
    cropAdviceText("Sowing: {date}", "en", { date: "2026-10-06" }),
    "Sowing: 2026-10-06",
  );
});

test("online soil explanation requests the selected language", async () => {
  const input = {
    crop: "Wheat",
    soil: "Alluvial",
    state: "Bihar",
    district: "Chhapra",
    ph: null,
    texture: null,
  };
  let instruction = "";
  const fetcher: typeof fetch = async (_url, init) => {
    instruction = JSON.parse(String(init?.body)).systemInstruction.parts[0]
      .text;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    tips: [
                      "सिंचाई से पहले खेत की जल निकासी जाँचें।",
                      "पोषक तत्व चुनने से पहले मिट्टी की रिपोर्ट प्राप्त करें।",
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
  };
  const response = await explainSoilReference(
    input,
    savedCropSoilAdvice(input),
    "test",
    "test",
    fetcher,
    "hi",
  );
  assert.match(instruction, /plain Hindi/);
  assert.doesNotMatch(instruction, /simple English/);
  assert.match(response.tips[0], /जल निकासी/);
});
