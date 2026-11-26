import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import mandiSnapshot from "@/data/mandi-prices.json";
import indiaLocations from "@/data/india-locations.json";
import { addMarketQuote, deleteMarketQuote } from "../../actions";
import MarketSearch from "./market-search";
import { fetchLiveMandi } from "@/lib/live-mandi";
import { checkRateLimit } from "@/lib/rate-limit";
import { indiaDateKey } from "@/lib/crop-cycle-status";
import { ChevronLeft, ChevronRight } from "lucide-react";

type SearchParams = {
  error?: string;
  saved?: string;
  commodity?: string;
  state?: string;
  district?: string;
  search?: string;
  page?: string;
  source?: string;
};

const PAGE_SIZE = 500;
type LocalMandiRow = {
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
const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const stateAliases: Record<string, string> = {
  andamanandnicobar: "andamanandnicobarislands",
  chattisgarh: "chhattisgarh",
  keralam: "kerala",
  nctofdelhi: "delhi",
  pondicherry: "puducherry",
};
const normalizeState = (value: string) =>
  stateAliases[normalize(value)] ?? normalize(value);

function formatPrice(value: string | number | undefined) {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return `₹${number.toLocaleString("en-IN")}`;
}

function buildPageUrl(
  page: number,
  filters: {
    commodity: string;
    state: string;
    district: string;
    source: string;
  },
) {
  const params = new URLSearchParams();

  params.set("search", "1");
  params.set("page", String(page));

  if (filters.commodity) {
    params.set("commodity", filters.commodity);
  }

  if (filters.state) {
    params.set("state", filters.state);
  }

  if (filters.district) {
    params.set("district", filters.district);
  }
  params.set("source", filters.source);

  return `/market?${params.toString()}`;
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getUser();
  if (!user) return null;

  const query = await searchParams;

  const commodity = query.commodity?.trim() ?? "";
  const state = query.state?.trim() ?? "";
  const district = query.district?.trim() ?? "";
  const source = query.source === "online" ? "online" : "offline";
  const pageSize = PAGE_SIZE;

  const currentPage = Math.max(1, Math.min(10000, Number(query.page) || 1));

  const snapshotRows = mandiSnapshot.records as LocalMandiRow[];
  const filteredRows =
    query.search === "1"
      ? snapshotRows.filter(
          (row) =>
            (!state ||
              normalizeState(row.State ?? "") === normalizeState(state)) &&
            (!district ||
              normalize(row.District ?? "") === normalize(district)) &&
            (!commodity ||
              normalize(row.Commodity ?? "") === normalize(commodity)),
        )
      : [];
  let liveTotal = filteredRows.length;
  let liveRows: LocalMandiRow[] = filteredRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  let liveError = "";
  let dataSourceNotice = `Offline snapshot · ${mandiSnapshot.meta.recordCount.toLocaleString("en-IN")} records dated ${mandiSnapshot.meta.dataDate}.`;
  let dataSourceHref = mandiSnapshot.meta.sourceUrl;
  let dataSourceLabel = "data.gov.in";
  let upstreamSourceUrl = "";
  if (source === "online" && query.search === "1") {
    const rate = checkRateLimit(`market-live:${user.id}`, 20, 60_000);
    if (!rate.allowed) {
      liveError =
        "Too many live mandi requests. Please wait a minute and try again. Showing matching records from the offline snapshot instead.";
    } else {
      try {
        const live = await fetchLiveMandi({
          state: state || undefined,
          district: district || undefined,
          commodity: commodity || undefined,
        });
        liveRows = live.records.map((row) => ({
          State: row.state,
          District: row.district,
          Market: row.market,
          Commodity: row.commodity,
          Arrival_Date: row.arrival_date,
          Variety: row.variety,
          Grade: row.grade,
          Min_Price: row.min_price,
          Max_Price: row.max_price,
          Modal_Price: row.modal_price,
        }));
        liveTotal = live.total;
        dataSourceNotice = `Online mandi prices · ${live.total.toLocaleString("en-IN")} records${live.asOf ? ` · source dated ${live.asOf}` : ""}.`;
        dataSourceHref =
          live.provider === "Finnid"
            ? "https://finnid.in/MarketLinkage/LivePrices"
            : live.provider === "data.gov.in"
              ? "https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi"
              : "https://www.voiceofvillage.com/developers";
        dataSourceLabel = live.provider;
        upstreamSourceUrl = live.sourceUrl || "";
      } catch (error) {
        liveError = `${error instanceof Error ? error.message : "Online mandi search failed."} Showing matching records from the offline snapshot instead.`;
      }
    }
  }
  const stateCoverage = indiaLocations.states.map((item) => {
    const rows = snapshotRows.filter(
      (row) => normalizeState(row.State ?? "") === normalizeState(item.name),
    );
    return {
      name: item.name,
      records: rows.length,
      markets: new Set(rows.map((row) => row.Market).filter(Boolean)).size,
      commodities: new Set(rows.map((row) => row.Commodity).filter(Boolean))
        .size,
    };
  });

  const totalPages = Math.max(1, Math.ceil(liveTotal / pageSize));

  const previousUrl = buildPageUrl(currentPage - 1, {
    commodity,
    state,
    district,
    source,
  });

  const nextUrl = buildPageUrl(currentPage + 1, {
    commodity,
    state,
    district,
    source,
  });

  // Existing saved quote database query.
  const quotes = await db.marketQuote.findMany({
    where: { userId: user.id },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <>
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Mandi Market Prices</h1>

        {query.error && (
          <p role="alert" style={{ color: "#b42318" }}>
            {query.error.replaceAll("+", " ")}
          </p>
        )}
        {query.saved && (
          <p role="status" style={{ color: "var(--green)" }}>
            {query.saved.replaceAll("+", " ")}
          </p>
        )}

        <p className="muted">
          Compare agricultural commodity prices from markets across India.
        </p>

        <h2>Search mandi prices</h2>

        <MarketSearch
          stateValue={state}
          districtValue={district}
          commodityValue={commodity}
          sourceValue={source}
        />

        <p role="status" className="muted">
          {dataSourceNotice} Source:{" "}
          <a href={dataSourceHref} target="_blank" rel="noreferrer">
            {dataSourceLabel}
          </a>
          {upstreamSourceUrl && (
            <>
              {" "}
              · Underlying data:{" "}
              <a href={upstreamSourceUrl} target="_blank" rel="noreferrer">
                AGMARKNET / data.gov.in
              </a>
            </>
          )}{" "}
          · Government Open Data License - India.
        </p>

        {liveError && (
          <p role="status" className="muted">
            {liveError}
          </p>
        )}

        {query.search === "1" && !liveError && liveRows.length === 0 && (
          <p role="status" className="muted">
            No mandi prices found.
          </p>
        )}

        {liveRows.length > 0 && (
          <>
            <p className="muted" style={{ fontSize: 13 }}>
              {source === "online" ? (
                `Showing ${liveRows.length} records returned by ${dataSourceLabel}.`
              ) : (
                <>
                  Showing {liveRows.length} records out of{" "}
                  {liveTotal.toLocaleString("en-IN")} available records. Page{" "}
                  {currentPage} of {totalPages}. Page size: {pageSize}.
                </>
              )}
            </p>

            <div className="market-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Commodity</th>
                    <th>Market</th>
                    <th>District / state</th>
                    <th>Variety</th>
                    <th>Grade</th>
                    <th>Min / max (₹/q)</th>
                    <th>Modal (₹/q)</th>
                    <th>Arrival date</th>
                  </tr>
                </thead>

                <tbody>
                  {liveRows.map((r, i) => (
                    <tr
                      key={`${r.State}-${r.District}-${r.Market}-${r.Commodity}-${r.Arrival_Date}-${i}`}
                    >
                      <td>{r.Commodity || "—"}</td>
                      <td>{r.Market || "—"}</td>
                      <td>
                        {r.District || "—"}, {r.State || "—"}
                      </td>
                      <td>{r.Variety || "—"}</td>
                      <td>{r.Grade || "—"}</td>
                      <td>
                        {formatPrice(r.Min_Price)} / {formatPrice(r.Max_Price)}
                      </td>
                      <td>{formatPrice(r.Modal_Price)}</td>
                      <td>{r.Arrival_Date || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Online APIs return district-filtered records; page through the
                complete bundled snapshot only in offline mode. */}
            {source === "offline" && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <span className="muted">
                    Page {currentPage} of {totalPages}
                  </span>

                  <div style={{ display: "flex", gap: 10 }}>
                    {currentPage > 1 ? (
                      <a href={previousUrl} className="btn">
                        <ChevronLeft size={18} aria-hidden="true" /> Previous
                      </a>
                    ) : (
                      <button className="btn" disabled>
                        <ChevronLeft size={18} aria-hidden="true" /> Previous
                      </button>
                    )}

                    {currentPage < totalPages &&
                    liveRows.length === pageSize ? (
                      <a href={nextUrl} className="btn">
                        Next <ChevronRight size={18} aria-hidden="true" />
                      </a>
                    ) : (
                      <button className="btn" disabled>
                        Next <ChevronRight size={18} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>
          Offline mandi coverage · all states and union territories
        </h2>
        <p className="muted">
          Every state/UT is listed below. Counts reflect the bundled data.gov.in
          snapshot dated {mandiSnapshot.meta.dataDate}; a zero means the source
          had no price records for that state on that date.
        </p>
        <div className="market-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>State / union territory</th>
                <th>Price records</th>
                <th>Markets</th>
                <th>Commodities</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {stateCoverage.map((item) => (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>{item.records.toLocaleString("en-IN")}</td>
                  <td>{item.markets.toLocaleString("en-IN")}</td>
                  <td>{item.commodities.toLocaleString("en-IN")}</td>
                  <td>
                    <a
                      href={`/market?search=1&state=${encodeURIComponent(item.name)}`}
                    >
                      {item.records ? "View prices" : "No snapshot prices"}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Add a manual price quote</h2>
        <p className="muted">
          Record a price you received directly from a mandi or buyer.
        </p>

        <form action={addMarketQuote}>
          <Field label="Crop">
            <input name="crop" maxLength={80} required />
          </Field>
          <Field label="Mandi / buyer">
            <input name="mandi" maxLength={120} required />
          </Field>
          <Field label="Price (₹)">
            <input
              type="number"
              name="price"
              min="0.01"
              max="999999999"
              step="0.01"
              required
            />
          </Field>
          <Field label="Unit">
            <select name="unit" defaultValue="quintal" required>
              <option value="kg">per kg</option>
              <option value="quintal">per quintal</option>
            </select>
          </Field>
          <Field label="Quote date">
            <input
              type="date"
              name="quoteDate"
              defaultValue={indiaDateKey(new Date())}
              required
            />
          </Field>
          <button className="btn" type="submit">
            Save manual quote
          </button>
        </form>
      </section>

      {/* Saved market quotes */}
      <section className="panel" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Your saved quotes</h2>

        {quotes.length === 0 ? (
          <div className="empty-state">
            <strong>No price quotes yet</strong>
            <p className="muted">Saved manual quotes will appear here.</p>
          </div>
        ) : (
          <div className="market-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Crop</th>
                  <th>Mandi / buyer</th>
                  <th>Price</th>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td>{q.crop}</td>
                    <td>{q.mandi}</td>

                    <td>
                      ₹
                      {Number(q.price).toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      / {q.unit}
                    </td>

                    <td>
                      {new Date(q.quoteDate).toLocaleDateString("en-IN", {
                        timeZone: "UTC",
                      })}
                    </td>

                    <td>
                      <span className="manual-tag">Manual</span>
                    </td>

                    <td>
                      <form action={deleteMarketQuote}>
                        <input type="hidden" name="id" value={q.id} />

                        <button
                          className="text-button"
                          aria-label={`Delete ${q.crop} quote from ${q.mandi}`}
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
