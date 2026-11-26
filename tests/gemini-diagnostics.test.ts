import assert from "node:assert/strict";
import test from "node:test";
import {
  geminiHttpFailure,
  geminiTransportFailure,
} from "../src/lib/gemini-diagnostics";

test("Gemini authentication, quota, and model failures receive distinct safe codes", async () => {
  assert.equal(
    await geminiHttpFailure(
      new Response(
        JSON.stringify({ error: { message: "API key not valid" } }),
        { status: 400 },
      ),
    ),
    "INVALID_KEY",
  );
  assert.equal(
    await geminiHttpFailure(new Response("{}", { status: 429 })),
    "QUOTA_OR_RATE_LIMIT",
  );
  assert.equal(
    await geminiHttpFailure(new Response("{}", { status: 404 })),
    "MODEL_UNAVAILABLE",
  );
});

test("Gemini timeouts and malformed provider responses are classified", () => {
  const timeout = new Error("deadline");
  timeout.name = "TimeoutError";
  assert.equal(geminiTransportFailure(timeout), "REQUEST_TIMEOUT");
  assert.equal(
    geminiTransportFailure(new SyntaxError("bad json")),
    "INVALID_JSON",
  );
});
