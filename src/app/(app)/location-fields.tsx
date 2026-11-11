
"use client";

import { useState } from "react";
import locations from "@/data/india-locations.json";

const normalized = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

// Original state name -> corrected/API state name
const STATE_NAME_MAP: Record<string, string> = {
  "Orissa": "Odisha",
  "Uttaranchal": "Uttarakhand",
  "Pondicherry": "Puducherry",
  "NCT of Delhi": "Delhi",
  "Jammu & Kashmir": "Jammu and Kashmir",
};

// Display corrected name and send corrected name to API
const getStateName = (name: string) =>
  STATE_NAME_MAP[name] ?? name;

type Props = {
  idPrefix: string;
  stateValue?: string;
  districtValue?: string;
  stateRequired?: boolean;
  districtRequired?: boolean;
  includeDistrict?: boolean;
  stateLabel?: string;
  districtLabel?: string;
  onLocationChange?: (state: string, district: string) => void;
  allStatesOption?: boolean;
};

const states = [...locations.states].sort((a, b) =>
  getStateName(a.name).localeCompare(getStateName(b.name))
);

export default function LocationFields({
  idPrefix,
  stateValue = "",
  districtValue = "",
  stateRequired = false,
  districtRequired = false,
  includeDistrict = true,
  stateLabel = "State",
  districtLabel = "District",
  onLocationChange,
  allStatesOption = false,
}: Props) {
  const matchedState = locations.states.find(item =>
    normalized(getStateName(item.name)) === normalized(stateValue) ||
    normalized(item.name) === normalized(stateValue)
  );

  const [state, setState] = useState(
    matchedState?.code ??
      (stateValue ? `legacy:${stateValue}` : "")
  );

  const [district, setDistrict] = useState(districtValue);

  const selectedState = locations.states.find(
    item => item.code === state
  );

  const districts = locations.districts
    .filter(item => item.stateCode === state)
    .sort((a, b) => a.name.localeCompare(b.name));

  const districtExists = districts.some(
    item => normalized(item.name) === normalized(district)
  );

  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-state`}>
          {stateLabel}
        </label>

        <select
          id={`${idPrefix}-state`}
          value={state}
          required={stateRequired}
          onChange={event => {
            const nextState = event.target.value;
            setState(nextState);
            setDistrict("");
            const next = locations.states.find(item => item.code === nextState);
            onLocationChange?.(next ? getStateName(next.name) : "", "");
          }}
        >
          <option value="">
            {allStatesOption ? "All India (all states)" : "Select state / UT"}
          </option>

          {stateValue && !matchedState && (
            <option value={`legacy:${stateValue}`}>
              {stateValue} (saved value)
            </option>
          )}

          {states.map(item => (
            <option key={item.code} value={item.code}>
              {getStateName(item.name)}
            </option>
          ))}
        </select>

        <input
          type="hidden"
          name="state"
          value={
            selectedState
              ? getStateName(selectedState.name)
              : state.replace(/^legacy:/, "")
          }
        />
      </div>

      {includeDistrict && (
        <div className="field">
          <label htmlFor={`${idPrefix}-district`}>
            {districtLabel}
          </label>

          <select
            id={`${idPrefix}-district`}
            name="district"
            value={district}
            required={districtRequired}
            disabled={!selectedState}
            onChange={event => {
              setDistrict(event.target.value);
              onLocationChange?.(
                selectedState ? getStateName(selectedState.name) : "",
                event.target.value
              );
            }}
          >
            <option value="">
              {selectedState
                ? "Select district"
                : "Choose state first"}
            </option>

            {districtValue &&
              district === districtValue &&
              !districtExists && (
                <option value={districtValue}>
                  {districtValue} (saved value)
                </option>
              )}

            {districts.map(item => (
              <option key={item.code} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
