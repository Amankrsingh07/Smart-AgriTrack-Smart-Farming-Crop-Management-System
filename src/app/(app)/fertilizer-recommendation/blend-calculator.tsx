"use client";

import { useState } from "react";
import {
  phosphorusGrades,
  type PhosphorusGrade,
} from "@/lib/fertilizer-product-grades";
import { theoreticalFertilizerBlend } from "@/lib/fertilizer-blend";

export default function FertilizerBlendCalculator() {
  const [weight, setWeight] = useState("50");
  const [target, setTarget] = useState({ n: "10", p2o5: "10", k2o: "10" });
  const [source, setSource] = useState<PhosphorusGrade>("DAP");
  const result = theoreticalFertilizerBlend(
    Number(weight),
    {
      n: Number(target.n),
      p2o5: Number(target.p2o5),
      k2o: Number(target.k2o),
    },
    source,
  );

  return (
    <section className="panel soil-health-report" aria-live="polite">
      <p className="crop-advice-kicker">FORMULATION TOOL · OFFLINE</p>
      <h2>NPK blend calculator</h2>
      <p className="muted">
        Mathematical formulation only. This result is not a crop recommendation,
        application rate, or compatibility approval.
      </p>
      <div className="soil-health-grid">
        <label className="field">
          <span>Total mixture weight (kg)</span>
          <input
            type="number"
            min="0.001"
            max="100000"
            step="0.01"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Phosphorus product</span>
          <select
            value={source}
            onChange={(event) =>
              setSource(event.target.value as PhosphorusGrade)
            }
          >
            {Object.keys(phosphorusGrades).map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["n", "Target N (%)"],
            ["p2o5", "Target P₂O₅ (%)"],
            ["k2o", "Target K₂O (%)"],
          ] as const
        ).map(([key, label]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={target[key]}
              onChange={(event) =>
                setTarget((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>
      {result.status === "calculated" ? (
        <>
          <h3>Ingredient quantities</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Quantity (kg)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.products).map(([name, quantity]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{quantity.toFixed(3)}</td>
                  </tr>
                ))}
                <tr>
                  <td>Theoretical filler mass (material not selected)</td>
                  <td>{result.fillerKg.toFixed(3)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Calculated grade: N {result.composition.n.toFixed(2)}% · P₂O₅{" "}
            {result.composition.p2o5.toFixed(2)}% · K₂O{" "}
            {result.composition.k2o.toFixed(2)}%
          </p>
          {result.sulphurPercent > 0 && (
            <p>Sulphur contribution: {result.sulphurPercent.toFixed(2)}%.</p>
          )}
          <p className="muted">
            Full precision is used for the calculation; quantities are rounded
            only for display. Verify each ingredient&apos;s label and physical
            compatibility before any blending.
          </p>
        </>
      ) : (
        <p className="error-message" role="alert">
          {result.status === "invalid"
            ? "Enter valid non-negative target percentages and mixture weight."
            : result.status === "excess-nitrogen"
              ? "The selected phosphorus source would exceed the target nitrogen."
              : result.status === "nutrient-gap"
                ? "The selected product cannot supply the requested phosphorus within the other nutrient targets."
                : "The ingredient mass exceeds the requested total mixture weight."}
        </p>
      )}
    </section>
  );
}
