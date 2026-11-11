export type MandiRow = {
  State?: string;
  District?: string;
  Market?: string;
  Commodity?: string;
  Arrival_Date?: string;
  Variety?: string;
  Grade?: string;
  Min_Price?: string | number;
  Max_Price?: string | number;
  Modal_Price?: string | number;
};

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const ENDPOINT = `https://api.data.gov.in/resource/${RESOURCE_ID}`;

function field(record: Record<string, unknown>, lower: string, title: string) {
  return record[lower] ?? record[title];
}

export async function fetchLiveMandi(filters: { state?: string; district?: string; commodity?: string; offset?: number; limit?: number }) {
  const apiKey = process.env.DATA_GOV_IN_API_KEY?.trim();
  if (!apiKey) throw new Error("Live mandi mode needs DATA_GOV_IN_API_KEY in the server environment.");

  const params = new URLSearchParams({ "api-key": apiKey, format: "json", limit: String(Math.min(1000, Math.max(1, filters.limit ?? 500))), offset: String(Math.max(0, filters.offset ?? 0)) });
  // data.gov.in's resource exposes these fields with title-cased names. The
  // filter parameter names are case-sensitive for this resource.
  if (filters.state) params.set("filters[State]", filters.state);
  if (filters.district) params.set("filters[District]", filters.district);
  if (filters.commodity) params.set("filters[Commodity]", filters.commodity);

  const response = await fetch(`${ENDPOINT}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`data.gov.in returned HTTP ${response.status}.`);
  const payload = await response.json() as { records?: Array<Record<string, unknown>>; total?: string | number; total_count?: string | number; count?: string | number; message?: string; error?: string };
  if (!Array.isArray(payload.records)) throw new Error(payload.message || payload.error || "data.gov.in returned an unexpected response.");

  const records: MandiRow[] = payload.records.map(record => ({
    State: field(record, "state", "State") as string | undefined,
    District: field(record, "district", "District") as string | undefined,
    Market: field(record, "market", "Market") as string | undefined,
    Commodity: field(record, "commodity", "Commodity") as string | undefined,
    Arrival_Date: field(record, "arrival_date", "Arrival_Date") as string | undefined,
    Variety: field(record, "variety", "Variety") as string | undefined,
    Grade: field(record, "grade", "Grade") as string | undefined,
    Min_Price: field(record, "min_price", "Min_Price") as string | number | undefined,
    Max_Price: field(record, "max_price", "Max_Price") as string | number | undefined,
    Modal_Price: field(record, "modal_price", "Modal_Price") as string | number | undefined,
  }));

  const total = Number(payload.total ?? payload.total_count ?? payload.count ?? records.length);
  return { records, total: Number.isFinite(total) ? total : records.length };
}
