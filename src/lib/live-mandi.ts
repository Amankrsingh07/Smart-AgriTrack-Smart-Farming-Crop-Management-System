export type MandiRow = {
  state?: string;
  district?: string;
  market?: string;
  commodity?: string;
  arrival_date?: string;
  variety?: string;
  grade?: string;
  min_price?: string | number;
  max_price?: string | number;
  modal_price?: string | number;
};

export type LiveMandiFilters = {
  state?: string;
  district?: string;
  commodity?: string;
  arrivalDate?: string;
};

export type LiveMandiResult = {
  records: MandiRow[];
  total: number;
  count: number;
  asOf?: string;
  sourceUrl?: string;
};

const MCP_ENDPOINT = "https://www.voiceofvillage.com/api/mcp";

type MandiPrice = Record<string, unknown>;
type MandiData = {
  available?: boolean;
  message?: string;
  district?: string;
  state?: string;
  prices?: MandiPrice[];
};
type Citation = { source?: string; as_of?: string; url?: string; license?: string };
type McpPayload = {
  error?: { message?: string } | string;
  result?: {
    isError?: boolean;
    structuredContent?: { data?: MandiData; citations?: Citation[] };
    content?: Array<{ type?: string; text?: string }>;
  };
};

const notSelected = (value: string | undefined, sentinel: string) => {
  const clean = value?.trim();
  return clean && clean.toLowerCase() !== sentinel.toLowerCase() ? clean : undefined;
};

function parseToolResult(payload: McpPayload) {
  const result = payload.result;
  if (!result || payload.error || result.isError) {
    throw new Error("VoiceOfVillage returned an API error. Check the API key and try again.");
  }

  const structured = result.structuredContent;
  if (structured?.data) return { data: structured.data, citations: structured.citations ?? [] };

  const text = result.content?.find(item => item.type === "text")?.text;
  if (text) {
    try {
      const parsed = JSON.parse(text) as { data?: MandiData; citations?: Citation[] };
      if (parsed.data) return { data: parsed.data, citations: parsed.citations ?? [] };
    } catch {
      // A non-JSON tool error is handled below as a malformed response.
    }
  }
  throw new Error("VoiceOfVillage response did not include mandi data.");
}

function dateOnly(value: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : value.trim();
}

function mapPrice(row: MandiPrice, state?: string, district?: string): MandiRow {
  return {
    state: (row.state ?? row.state_name ?? state) as string | undefined,
    district: (row.district_name ?? row.district ?? district) as string | undefined,
    market: row.market as string | undefined,
    commodity: row.commodity as string | undefined,
    arrival_date: row.arrival_date as string | undefined,
    variety: row.variety as string | undefined,
    grade: row.grade as string | undefined,
    min_price: row.min_price as string | number | undefined,
    max_price: row.max_price as string | number | undefined,
    modal_price: row.modal_price as string | number | undefined,
  };
}

export async function fetchLiveMandi(filters: LiveMandiFilters = {}): Promise<LiveMandiResult> {
  const apiKey = process.env.VOV_API_KEY?.trim();
  if (!apiKey) throw new Error("Online VoiceOfVillage prices need VOV_API_KEY in the server environment.");

  const state = notSelected(filters.state, "All India");
  const district = notSelected(filters.district, "All Districts");
  const commodity = notSelected(filters.commodity, "All Commodities");
  if (!district) {
    throw new Error("VoiceOfVillage online mandi prices require a district. Select a state and district, or use the offline All India snapshot.");
  }

  const arguments_: Record<string, string | number | boolean | object> = {
    district,
    days: filters.arrivalDate ? 30 : 7,
  };
  if (state) arguments_.state = state;
  if (commodity) arguments_.commodity = commodity;
  const targetDate = filters.arrivalDate ? dateOnly(filters.arrivalDate) : undefined;

  let response: Response;
  try {
    response = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_mandi_prices", arguments: arguments_ },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("VoiceOfVillage mandi network failure", { errorName: error instanceof Error ? error.name : "UnknownError" });
    throw new Error("Could not reach VoiceOfVillage. Check the server's internet connection and try again.");
  }

  if (!response.ok) {
    console.error("VoiceOfVillage mandi request failed", { status: response.status, retryAfter: response.headers.get("retry-after") });
    const retryAfter = response.headers.get("retry-after");
    throw new Error(response.status === 429
      ? `VoiceOfVillage rate limit reached. Try again${retryAfter ? ` in ${retryAfter} seconds` : " later"}.`
      : `VoiceOfVillage returned HTTP ${response.status}. Check the API key and resource access.`);
  }

  let payload: McpPayload;
  try {
    payload = await response.json() as McpPayload;
  } catch {
    console.error("VoiceOfVillage mandi response was not valid JSON");
    throw new Error("VoiceOfVillage returned an invalid response.");
  }

  const { data, citations } = parseToolResult(payload);
  if (data.available === false) {
    throw new Error(data.message || "VoiceOfVillage has no mandi prices for that district.");
  }
  if (!Array.isArray(data.prices)) {
    console.error("VoiceOfVillage mandi response missing prices", { payloadKeys: Object.keys(data) });
    throw new Error("VoiceOfVillage response did not include a prices list.");
  }

  const rows = data.prices.map(row => mapPrice(row, state, data.district ?? district));
  const records = targetDate ? rows.filter(row => row.arrival_date && dateOnly(row.arrival_date) === targetDate) : rows;
  const citation = citations.find(item => item.source || item.as_of || item.url);
  return {
    records,
    total: records.length,
    count: records.length,
    asOf: citation?.as_of,
    sourceUrl: citation?.url,
  };
}
