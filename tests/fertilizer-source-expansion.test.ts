import test from "node:test";
import assert from "node:assert/strict";
import { geminiHttpFailure, geminiRetryable, geminiTransportFailure } from "../src/lib/gemini-diagnostics";

test("Gemini diagnostics classify failures and avoid retrying quota or explicit retry delays", async () => {
  assert.equal(await geminiHttpFailure(Response.json({ error: { details: [{ reason: "API_KEY_INVALID" }] } }, { status: 400 })), "INVALID_KEY");
  assert.equal(await geminiHttpFailure(new Response(null, { status: 429 })), "QUOTA_OR_RATE_LIMIT");
  assert.equal(geminiTransportFailure(new DOMException("timed out", "TimeoutError")), "REQUEST_TIMEOUT");
  assert.equal(geminiRetryable(new Response(null, { status: 503 })), true);
  assert.equal(geminiRetryable(new Response(null, { status: 503, headers: { "Retry-After": "20" } })), false);
  assert.equal(geminiRetryable(new Response(null, { status: 429 })), false);
});

