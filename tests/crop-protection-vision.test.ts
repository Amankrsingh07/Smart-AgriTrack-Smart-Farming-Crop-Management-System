import { test } from "node:test";
import assert from "node:assert/strict";
import { observeProtectionImage } from "../src/lib/crop-protection-vision";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64",
);
const reply =
  (v: unknown): typeof fetch =>
  async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(v) }] } }],
      }),
    );
test("vision uses real image requests, accepts only visible features and never diagnoses", async () => {
  let sent = "";
  const r = await observeProtectionImage(png, "image/png", {
    apiKey: "test-only",
    model: "configured-model",
    fetcher: async (_url, init) => {
      sent = String(init?.body);
      return reply({ interpretable: true, visibleSymptoms: ["Yellow leaves"] })(
        _url,
        init,
      );
    },
  });
  assert.equal(r.available, true);
  assert.deepEqual(r.visibleSymptoms, ["Yellow leaves"]);
  assert.deepEqual(JSON.parse(sent).contents[0].parts[1].inlineData, {
    mimeType: "image/png",
    data: png.toString("base64"),
  });
  assert.match(r.limitation, /cannot confirm disease/);
});
test("vision missing model, provider errors, invented diagnosis or uninterpretability fall back", async () => {
  assert.equal(
    (await observeProtectionImage(png, "image/png")).available,
    false,
  );
  for (const fetcher of [
    reply({
      interpretable: true,
      visibleSymptoms: ["Confirmed contamination"],
    }),
    reply({ interpretable: false, visibleSymptoms: [] }),
    reply({ interpretable: true, visibleSymptoms: [], dose: "spray" }),
    async () => new Response("unavailable", { status: 503 }),
  ])
    assert.equal(
      (
        await observeProtectionImage(png, "image/png", {
          apiKey: "test-only",
          model: "configured-model",
          fetcher,
        })
      ).available,
      false,
    );
  await assert.rejects(() =>
    observeProtectionImage(Buffer.from("spoof"), "image/png"),
  );
});
