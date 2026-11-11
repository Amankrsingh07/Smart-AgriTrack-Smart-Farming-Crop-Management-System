"use client";

import { useEffect, useState } from "react";
import LocationFields from "../location-fields";

export default function MarketSearch({
  stateValue,
  districtValue,
  commodityValue,
  sourceValue,
}: {
  stateValue: string;
  districtValue: string;
  commodityValue: string;
  sourceValue: "offline" | "online";
}) {
  const [state, setState] = useState(stateValue);
  const [district, setDistrict] = useState(districtValue);
  const [commodities, setCommodities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [source, setSource] = useState(sourceValue);

  useEffect(() => setSource(sourceValue), [sourceValue]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ state, district, source });
    setLoading(true);
    setOptionsError("");

    fetch(`/api/market/options?${params}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load commodities.");
        return data;
      })
      .then(data => {
        setCommodities(Array.isArray(data.commodities) ? data.commodities : []);
        setOptionsError(data.message || data.error || "");
      })
      .catch(error => {
        if (error.name !== "AbortError") {
          setCommodities([]);
          setOptionsError(error.message || "Unable to load commodities.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [state, district, source]);

  const selectedCommodityExists = commodities.some(
    value => value.toLowerCase() === commodityValue.toLowerCase()
  );

  return (
    <form action="/market" method="GET">
      <input type="hidden" name="search" value="1" />
      <input type="hidden" name="page" value="1" />

      <LocationFields
        idPrefix="market-search"
        stateValue={stateValue}
        districtValue={districtValue}
        includeDistrict
        stateRequired={false}
        districtRequired={false}
        allStatesOption
        onLocationChange={(nextState, nextDistrict) => {
          setState(nextState);
          setDistrict(nextDistrict);
        }}
      />

      <div className="field">
        <label htmlFor="market-source">Price data mode</label>
        <select id="market-source" name="source" value={source} onChange={event => setSource(event.target.value as "offline" | "online")}>
          <option value="offline">Offline bundled snapshot (no internet)</option>
          <option value="online">Online data.gov.in daily prices</option>
        </select>
        <small className="muted">Online mode contacts the official data.gov.in service. If it is unavailable, the results page falls back to the bundled offline snapshot.</small>
      </div>

      <div className="field">
        <label htmlFor="commodity">Commodity</label>
        <select id="commodity" name="commodity" defaultValue={commodityValue}>
          <option value="">All commodities</option>
          {commodityValue && !selectedCommodityExists && (
            <option value={commodityValue}>{commodityValue}</option>
          )}
          {commodities.map(value => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <small className="muted">
          {loading
            ? "Loading commodities for this location…"
            : optionsError
              ? optionsError
            : state
              ? commodities.length
                ? source === "online" ? "Commodity names loaded from data.gov.in." : "Commodity names are loaded from the bundled data.gov.in snapshot."
                : source === "offline"
                  ? district
                    ? "No offline prices match this district. Clear the district to check other markets in this state, or switch to online prices."
                    : "No offline prices are available for this state in the bundled snapshot. Switch to online prices to check current listings."
                  : "No online commodities were returned for this location. Try a different district or state."
              : source === "online" ? "Select a state to load current commodity names from data.gov.in." : "Select a state to load available commodities from the bundled snapshot."}
        </small>
      </div>

      <button className="btn" type="submit">{source === "online" ? "Search online prices" : "Search offline prices"}</button>
    </form>
  );
}
