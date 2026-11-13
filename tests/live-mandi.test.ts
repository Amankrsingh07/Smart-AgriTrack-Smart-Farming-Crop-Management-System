import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit } from "../src/lib/rate-limit";
import { fetchLiveMandi } from "../src/lib/live-mandi";

const samplePrice = {
  arrival_date: "2026-11-11",
  district_name: "Nandyal",
  market: "Allagadda APMC",
  commodity: "Maize",
  variety: "Local",
  min_price: 2000,
  max_price: 2200,
  modal_price: 2100,
};
const citations = [{ source: "AGMARKNET via data.gov.in", as_of: "2026-11-11", url: "https://www.data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi", license: "GODL-India" }];

function response(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => payload } as Response;
}

function toolResponse(data: Record<string, unknown>, sourceCitations = citations) {
  return { jsonrpc: "2.0", id: 1, result: { isError: false, structuredContent: { data, citations: sourceCitations } } };
}

async function withFetchMock<T>(mock: typeof fetch, run: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.VOV_API_KEY;
  globalThis.fetch = mock;
  process.env.VOV_API_KEY = "test-vov-key-never-logged";
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.VOV_API_KEY;
    else process.env.VOV_API_KEY = previousKey;
  }
}

test("district lookup sends Bearer auth and maps VoiceOfVillage prices and citation", async () => {
  let body: Record<string, unknown> | undefined;
  let authorization = "";
  await withFetchMock((async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    body = JSON.parse(String(init?.body));
    return response(toolResponse({ district: "Nandyal", prices: [samplePrice] }));
  }) as typeof fetch, async () => {
    const result = await fetchLiveMandi({ state: "Andhra Pradesh", district: "Nandyal", commodity: "Maize" });
    assert.equal(authorization, "Bearer test-vov-key-never-logged");
    assert.deepEqual(body, {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "get_mandi_prices", arguments: { district: "Nandyal", days: 7, state: "Andhra Pradesh", commodity: "Maize" } },
    });
    assert.deepEqual(result.records[0], {
      state: "Andhra Pradesh", district: "Nandyal", market: "Allagadda APMC", commodity: "Maize",
      arrival_date: "2026-11-11", variety: "Local", grade: undefined,
      min_price: 2000, max_price: 2200, modal_price: 2100,
    });
    assert.equal(result.total, 1);
    assert.equal(result.asOf, "2026-11-11");
    assert.match(result.sourceUrl ?? "", /data\.gov\.in/);
  });
});

test("All India and state-only calls explain that VoiceOfVillage requires a district", async () => {
  await withFetchMock((async () => { throw new Error("should not make a request without a district"); }) as typeof fetch, async () => {
    await assert.rejects(fetchLiveMandi(), /require a district/);
    await assert.rejects(fetchLiveMandi({ state: "Andhra Pradesh" }), /require a district/);
    await assert.rejects(fetchLiveMandi({ state: "All India", district: "All Districts" }), /require a district/);
  });
});

test("arrival date requests the 30-day window and filters to the selected date", async () => {
  let body: Record<string, unknown> | undefined;
  await withFetchMock((async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return response(toolResponse({ district: "Nandyal", prices: [
      samplePrice,
      { ...samplePrice, arrival_date: "2026-11-10", market: "Nandyal APMC" },
    ] }));
  }) as typeof fetch, async () => {
    const result = await fetchLiveMandi({ district: "Nandyal", arrivalDate: "2026-11-11" });
    const args = (body?.params as { arguments: Record<string, unknown> }).arguments;
    assert.equal(args.days, 30);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0]?.arrival_date, "2026-11-11");
  });
});

test("empty price arrays are valid results", async () => {
  await withFetchMock((async () => response(toolResponse({ district: "Nandyal", prices: [] }))) as typeof fetch, async () => {
    const result = await fetchLiveMandi({ district: "Nandyal" });
    assert.deepEqual(result.records, []);
    assert.equal(result.total, 0);
  });
});

test("VoiceOfVillage unavailable responses are errors, not empty prices", async () => {
  await withFetchMock((async () => response(toolResponse({ available: false, message: "District not found." }))) as typeof fetch, async () => {
    await assert.rejects(fetchLiveMandi({ district: "Unknown" }), /District not found/);
  });
});

test("invalid API key errors are surfaced", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    await withFetchMock((async () => response({ error: "unauthorized" }, 401)) as typeof fetch, async () => {
      await assert.rejects(fetchLiveMandi({ district: "Nandyal" }), /HTTP 401/);
    });
  } finally {
    console.error = originalError;
  }
});

test("VoiceOfVillage rate limit response includes a retry hint", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    await withFetchMock((async () => response({}, 429, { "retry-after": "30" })) as typeof fetch, async () => {
      await assert.rejects(fetchLiveMandi({ district: "Nandyal" }), /30 seconds/);
    });
  } finally {
    console.error = originalError;
  }
});

test("the app live search rate limiter rejects excess requests", () => {
  const key = `vov-mandi-test-${Date.now()}-${Math.random()}`;
  assert.equal(checkRateLimit(key, 1, 60_000).allowed, true);
  assert.equal(checkRateLimit(key, 1, 60_000).allowed, false);
});

test("network failures are surfaced without logging the key", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    await withFetchMock((async () => { throw new TypeError("socket unavailable"); }) as typeof fetch, async () => {
      await assert.rejects(fetchLiveMandi({ district: "Nandyal" }), /Could not reach VoiceOfVillage/);
    });
  } finally {
    console.error = originalError;
  }
});

test("a malformed MCP response is not reported as a zero-result response", async () => {
  await withFetchMock((async () => response({ jsonrpc: "2.0", result: { content: [] } })) as typeof fetch, async () => {
    await assert.rejects(fetchLiveMandi({ district: "Nandyal" }), /did not include mandi data/);
  });
});
