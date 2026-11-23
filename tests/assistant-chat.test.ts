import assert from "node:assert/strict";
import test from "node:test";
import { assistantConversationTitle, boundedAssistantHistory } from "../src/lib/assistant-chat";
import { assistantChatText } from "../src/i18n/assistant-chat";
import { languages } from "../src/i18n/languages";

test("Gemini context is ordered, bounded to recent messages, and maps assistant to model", () => {
  const messages = Array.from({ length: 18 }, (_, index) => ({ role: index % 2 ? "ASSISTANT" : "USER", content: `turn-${index}` }));
  const context = boundedAssistantHistory(messages);
  assert.equal(context.length, 12);
  assert.equal(context[0].parts[0].text, "turn-6");
  assert.equal(context.at(-1)?.parts[0].text, "turn-17");
  assert.equal(context[0].role, "user");
  assert.equal(context[1].role, "model");
});

test("Gemini history rejects unknown roles and bounds an individual message", () => {
  const context = boundedAssistantHistory([
    { role: "SYSTEM", content: "not trusted conversation history" },
    { role: "USER", content: "x".repeat(3000) },
  ]);
  assert.equal(context.length, 1);
  assert.equal(context[0].parts[0].text.length, 2400);
});

test("conversation titles stay short and preserve the farmer's opening question", () => {
  assert.equal(assistantConversationTitle("  How   should I check my field? "), "How should I check my field?");
  assert.equal(assistantConversationTitle("x".repeat(200)).length, 178);
});

test("chat controls have localized labels for each configured language", () => {
  for (const language of languages) {
    assert.ok(assistantChatText(language.code, "newChat").trim());
    assert.ok(assistantChatText(language.code, "listen").trim());
    assert.ok(assistantChatText(language.code, "offlineNote").trim());
    assert.ok(assistantChatText(language.code, "retry").trim());
    assert.ok(assistantChatText(language.code, "storageUnavailable").trim());
  }
  assert.notEqual(assistantChatText("hi", "newChat"), assistantChatText("en", "newChat"));
});
