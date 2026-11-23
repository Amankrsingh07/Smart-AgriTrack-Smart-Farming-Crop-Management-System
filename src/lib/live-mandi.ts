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
  provider: "data.gov.in" | "Finnid" | "VoiceOfVillage";
};

const MCP_ENDPOINT = "https://www.voiceofvillage.com/api/mcp";
const DATA_GOV_ENDPOINT = "https://api.data.gov.in/resource";
const DATA_GOV_RESOURCE_DEFAULT = "9ef84268-d588-465a-a308-a864a43d0070";

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
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : value.trim();
}

function mapPrice(row: MandiPrice, state?: string, district?: string): MandiRow {
  return {
    state: (row.state ?? row.state_name ?? row.State ?? state) as string | undefined,
    district: (row.district_name ?? row.district ?? row.District ?? district) as string | undefined,
    market: (row.market ?? row.Market) as string | undefined,
    commodity: (row.commodity ?? row.Commodity) as string | undefined,
    arrival_date: (row.arrival_date ?? row.Arrival_Date ?? row.arrivalDate) as string | undefined,
    variety: (row.variety ?? row.Variety) as string | undefined,
    grade: (row.grade ?? row.Grade) as string | undefined,
    min_price: (row.min_price ?? row.Min_Price ?? row.minPrice) as string | number | undefined,
    max_price: (row.max_price ?? row.Max_Price ?? row.maxPrice) as string | number | undefined,
    modal_price: (row.modal_price ?? row.Modal_Price ?? row.modalPrice) as string | number | undefined,
  };
}

async function fetchFinnidMandi(filters: LiveMandiFilters): Promise<LiveMandiResult> {
  const state = notSelected(filters.state, "All India");
  const district = notSelected(filters.district, "All Districts");
  const commodity = notSelected(filters.commodity, "All Commodities");
  if (!district) throw new Error("Online mandi prices require a district. Select a state and district, or use the offline All India snapshot.");

  let response: Response;
  try {
    response = await fetch("https://finnid.in/MarketLinkage/GetMandiPrices", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ state: state ?? "", district, market: "", commodity: commodity ?? "", grade: "" }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("Finnid mandi network failure", { errorName: error instanceof Error ? error.name : "UnknownError" });
    throw new Error("Could not reach Finnid live mandi prices. Check the server's internet connection and try again.", { cause: error });
  }
  if (!response.ok) {
    console.error("Finnid mandi request failed", { status: response.status, retryAfter: response.headers.get("retry-after") });
    throw new Error(response.status === 429
      ? "Finnid mandi rate limit reached. Try again later."
      : `Finnid returned HTTP ${response.status}.`);
  }

  let payload: { success?: boolean; data?: MandiPrice[]; error?: string };
  try { payload = await response.json() as typeof payload; }
  catch { throw new Error("Finnid returned an invalid mandi response."); }
  if (payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error(payload.error || "Finnid did not return mandi records.");
  }

  const targetDate = filters.arrivalDate ? dateOnly(filters.arrivalDate) : undefined;
  const rows = payload.data.map(row => {
    const mapped = mapPrice(row, state, district);
    return { ...mapped, arrival_date: mapped.arrival_date ? dateOnly(mapped.arrival_date) : undefined };
  });
  const records = rows.filter(row =>
    !commodity || row.commodity?.toLowerCase() === commodity.toLowerCase()
  ).filter(row => !targetDate || (row.arrival_date && dateOnly(row.arrival_date) === targetDate));
  const latestDate = records.map(row => row.arrival_date).filter((value): value is string => Boolean(value)).sort((a, b) => dateOnly(a).localeCompare(dateOnly(b))).at(-1);
  return {
    records,
    total: records.length,
    count: records.length,
    asOf: latestDate ? dateOnly(latestDate) : undefined,
    sourceUrl: "https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi",
    provider: "Finnid",
  };
}

async function fetchDataGovMandi(filters: LiveMandiFilters, apiKey: string): Promise<LiveMandiResult> {
  const state = notSelected(filters.state, "All India");
  const district = notSelected(filters.district, "All Districts");
  const commodity = notSelected(filters.commodity, "All Commodities");
  const resourceId = process.env.DATA_GOV_IN_RESOURCE_ID?.trim() || DATA_GOV_RESOURCE_DEFAULT;
  if (!/^[\w-]{20,80}$/.test(resourceId)) throw new Error("DATA_GOV_IN_RESOURCE_ID is invalid.");

  const url = new URL(`${DATA_GOV_ENDPOINT}/${encodeURIComponent(resourceId)}`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1000");
  url.searchParams.set("offset", "0");
  if (state) url.searchParams.set("filters[State]", state);
  if (district) url.searchParams.set("filters[District]", district);
  if (commodity) url.searchParams.set("filters[Commodity]", commodity);
  if (filters.arrivalDate) {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(filters.arrivalDate);
    if (iso) url.searchParams.set("filters[Arrival_Date]", `${iso[3]}/${iso[2]}/${iso[1]}`);
  }

  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    console.error("data.gov.in mandi network failure", { errorName: error instanceof Error ? error.name : "UnknownError" });
    throw new Error("Could not reach data.gov.in. Check the server's internet connection and try again.", { cause: error });
  }
  if (!response.ok) {
    console.error("data.gov.in mandi request failed", { status: response.status, retryAfter: response.headers.get("retry-after") });
    throw new Error(response.status === 429
      ? "data.gov.in rate limit reached. Try again later."
      : `data.gov.in returned HTTP ${response.status}. Check the API key and resource access.`);
  }

  let payload: { records?: MandiPrice[]; total?: string | number; count?: string | number; message?: string; error?: string };
  try { payload = await response.json() as typeof payload; }
  catch { throw new Error("data.gov.in returned an invalid response."); }
  if (!Array.isArray(payload.records)) {
    console.error("data.gov.in mandi response missing records", { payloadKeys: Object.keys(payload) });
    throw new Error(payload.message || payload.error || "data.gov.in response did not include mandi records.");
  }

  const records = payload.records.map(row => mapPrice(row, state, district));
  const latestDate = records.map(row => row.arrival_date).filter((value): value is string => Boolean(value)).sort().at(-1);
  const sourceUrl = "https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi";
  return {
    records,
    total: Number(payload.total) || records.length,
    count: Number(payload.count) || records.length,
    asOf: latestDate ? dateOnly(latestDate) : undefined,
    sourceUrl,
    provider: "data.gov.in",
  };
}

async function fetchVoiceOfVillageMandi(filters: LiveMandiFilters): Promise<LiveMandiResult> {
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
    throw new Error("Could not reach VoiceOfVillage. Check the server's internet connection and try again.", { cause: error });
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
    provider: "VoiceOfVillage",
  };
}

export async function fetchLiveMandi(filters: LiveMandiFilters = {}): Promise<LiveMandiResult> {
  const dataGovKey = process.env.DATA_GOV_IN_API_KEY?.trim();
  if (dataGovKey) return fetchDataGovMandi(filters, dataGovKey);
  try {
    return await fetchFinnidMandi(filters);
  } catch (error) {
    if (process.env.VOV_API_KEY?.trim()) return fetchVoiceOfVillageMandi(filters);
    throw error;
  }
}
