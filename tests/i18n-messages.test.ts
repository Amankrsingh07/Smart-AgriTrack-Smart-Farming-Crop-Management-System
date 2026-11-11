import test from "node:test";
import assert from "node:assert/strict";
import { authMessagesFor } from "../src/i18n/auth-messages";
import { pageMessagesFor } from "../src/i18n/page-messages";
import { displayLabel } from "../src/i18n/display-labels";
import { languages, isLanguageCode } from "../src/i18n/languages";

test("English, Hindi and Bengali page messages share keys and translated values", () => {
  for (const namespace of ["Auth", "Farms", "Crops"] as const) {
    const messages = namespace === "Auth"
      ? [authMessagesFor("en"), authMessagesFor("hi"), authMessagesFor("bn")]
      : [pageMessagesFor("en")[namespace], pageMessagesFor("hi")[namespace], pageMessagesFor("bn")[namespace]];
    const keys = Object.keys(messages[0]).sort();
    for (const localeMessages of messages.slice(1)) assert.deepEqual(Object.keys(localeMessages).sort(), keys, `${namespace} keys`);
    for (const localeMessages of messages) assert.ok(Object.values(localeMessages).every(value => typeof value === "string" && value.trim().length > 0), `${namespace} translations are non-empty`);
  }
});

test("known database labels localize without changing unknown farmer-entered text", () => {
  assert.equal(displayLabel("Maize", "hi"), "मक्का");
  assert.equal(displayLabel("Rabi", "bn"), "রবি");
  assert.equal(displayLabel("My north field", "hi"), "My north field");
});

test("language selector includes the requested Indian languages including Odia", () => {
  for (const code of ["en", "hi", "bn", "ta", "ml", "or", "pa", "mr", "gu", "te", "kn"]) {
    assert.ok(isLanguageCode(code), `${code} is selectable`);
  }
  assert.equal(languages.length, 11);
});
