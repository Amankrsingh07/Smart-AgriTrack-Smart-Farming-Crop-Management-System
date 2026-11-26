import assert from "node:assert/strict";
import test from "node:test";
import { assistantApiFailure } from "../src/lib/assistant-api-errors";

test("database connectivity failures become a retryable chat storage response", () => {
  const failure = assistantApiFailure(
    { name: "PrismaClientInitializationError" },
    "test",
  );
  assert.equal(failure.status, 503);
  assert.equal(failure.code, "CHAT_STORAGE_UNAVAILABLE");
  assert.match(failure.message, /temporarily unavailable/i);
});

test("missing assistant tables are reported as a schema setup issue", () => {
  const failure = assistantApiFailure(
    { name: "PrismaClientKnownRequestError", code: "P2021" },
    "test",
  );
  assert.equal(failure.status, 503);
  assert.equal(failure.code, "CHAT_SCHEMA_UNAVAILABLE");
});

test("unknown assistant failures do not expose exception details", () => {
  const failure = assistantApiFailure(
    new Error("secret connection string or SQL"),
    "test",
  );
  assert.equal(failure.status, 500);
  assert.doesNotMatch(failure.message, /secret|SQL|connection/i);
});
