"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { displayLabel } from "@/i18n/display-labels";
import LocationFields from "../location-fields";
import { cropGrowthStages as growthStages } from "@/lib/crop-growth-stages";
import { analyzeSoil, type SoilHealthInput } from "@/lib/soil-health";
import { calculateCustomFertilizer, calculateIcarFertilizer, getIcarRecipes, type IcarRecipe } from "@/lib/icar-fertilizer";

type Report = ReturnType<typeof analyzeSoil>;
type FormValues = Omit<SoilHealthInput, "nitrogenKgHa" | "phosphorusKgHa" | "potassiumKgHa" | "soilPh"> & { nitrogenKgHa: string; phosphorusKgHa: string; potassiumKgHa: string; soilPh: string };
export type SavedCheck = { id: string; createdAt: string; input: SoilHealthInput; result: Report };

const soilTypes = ["Alluvial", "Black", "Red", "Laterite", "Sandy", "Clay", "Loamy", "Other"];
const commonCrops = ["Wheat", "Rice (Paddy)", "Maize", "Millet", "Pearl millet", "Finger millet", "Sorghum", "Barley", "Mustard", "Chickpea (Gram)", "Pigeon pea", "Lentil", "Green gram", "Black gram", "Soybean", "Groundnut", "Sesame", "Sunflower", "Cotton", "Sugarcane", "Jute", "Potato", "Onion", "Tomato", "Chilli", "Turmeric", "Ginger", "Banana", "Mango"];
const emptyValues: FormValues = { state: "", district: "", crop: "", growthStage: "", soilType: "", nitrogenKgHa: "", phosphorusKgHa: "", potassiumKgHa: "", soilPh: "" };
const emptyManualRates = { n: "", p2o5: "", k2o: "", basalN: "", basalP: "", basalK: "", topdressLabel: "" };

export default function SoilHealthForm({ cropNames, initialHistory }: { cropNames: string[]; initialHistory: SavedCheck[] }) {
  const locale = useLocale();
  const t = useTranslations("Fertilizer");
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [areaHa, setAreaHa] = useState("1");
  const [recipeId, setRecipeId] = useState("");
  const [customCrop, setCustomCrop] = useState(false);
  const [manualRates, setManualRates] = useState(emptyManualRates);
  const [doseCalculated, setDoseCalculated] = useState(false);
  const set = (key: keyof FormValues, value: string) => setValues(current => ({ ...current, [key]: value }));
  const recipes = getIcarRecipes(values.crop, values.state, values.district);
  const selectedRecipe = recipes.find(recipe => recipe.id === recipeId) ?? recipes[0];
  const fertilizerPlan = selectedRecipe && Number(areaHa) > 0 ? calculateIcarFertilizer(selectedRecipe as IcarRecipe, Number(areaHa)) : null;
  const manualNumbers = [manualRates.n, manualRates.p2o5, manualRates.k2o, manualRates.basalN, manualRates.basalP, manualRates.basalK].map(Number);
  const manualInputsValid = manualRates.n !== "" && manualRates.p2o5 !== "" && manualRates.k2o !== "" && manualRates.basalN !== "" && manualRates.basalP !== "" && manualRates.basalK !== "" && manualRates.topdressLabel.trim() !== "" && manualNumbers.every(Number.isFinite) && manualNumbers.slice(0, 3).every(value => value >= 0 && value <= 100000) && manualNumbers[3] >= 0 && manualNumbers[3] <= 100 && manualNumbers[4] >= 0 && manualNumbers[4] <= 100 && manualNumbers[5] >= 0 && manualNumbers[5] <= 100 && Number(areaHa) > 0;
  const manualPlan = !selectedRecipe && manualInputsValid ? calculateCustomFertilizer({ nitrogenKgHa: manualNumbers[0], phosphorusP2O5KgHa: manualNumbers[1], potassiumK2OKgHa: manualNumbers[2], basalNitrogenPercent: manualNumbers[3], basalPhosphorusPercent: manualNumbers[4], basalPotassiumPercent: manualNumbers[5], areaHa: Number(areaHa), topdressLabel: manualRates.topdressLabel }) : null;
  const setManual = (key: keyof typeof emptyManualRates, value: string) => setManualRates(current => ({ ...current, [key]: value }));
  const cropOptions = [...new Set([...commonCrops, ...cropNames, "Arhar", "Paddy", "Corn", "Tur"])].sort((a, b) => a.localeCompare(b));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setReport(null); setBusy(true);
    const { soilPh, ...otherValues } = values;
    const payload = {
      ...otherValues,
      nitrogenKgHa: Number(values.nitrogenKgHa),
      phosphorusKgHa: Number(values.phosphorusKgHa),
      potassiumKgHa: Number(values.potassiumKgHa),
      ...(soilPh === "" ? {} : { soilPh: Number(soilPh) }),
    };
    try {
      const response = await fetch("/api/soil-health", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Soil check could not be completed.");
      setReport(data.result as Report);
      setHistory(current => [{ id: data.id, createdAt: data.createdAt, input: payload as SoilHealthInput, result: data.result as Report }, ...current].slice(0, 8));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Soil check could not be completed.");
    } finally { setBusy(false); }
  }

  async function deleteSavedCheck(id: string) {
    if (!window.confirm("Delete this saved recommendation?")) return;
    setDeletingId(id); setError("");
    try {
      const response = await fetch("/api/soil-health", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete the saved recommendation.");
      setHistory(current => current.filter(item => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the saved recommendation.");
    } finally { setDeletingId(""); }
  }


  return <div className="soil-health-layout">
    <form className="panel soil-health-form" onSubmit={submit}>
      <div className="soil-health-form-heading"><div><h2 style={{ margin: 0 }}>Enter soil test details</h2><p className="muted">Copy available N, P, K and pH values from a recent Soil Health Card or soil laboratory report.</p></div></div>
      <LocationFields idPrefix="soil-health" stateValue={values.state} districtValue={values.district} stateRequired districtRequired stateLabel={t("state")} districtLabel={t("district")} onLocationChange={(state, district) => { setDoseCalculated(false); setValues(current => ({ ...current, state, district })); }}/>
      <div className="soil-health-grid">
        <label className="field"><span>{t("crop")}</span><select value={customCrop ? "__other__" : values.crop} onChange={event => { const value = event.target.value; setRecipeId(""); setDoseCalculated(false); if (value === "__other__") { setCustomCrop(true); set("crop", ""); } else { setCustomCrop(false); set("crop", value); } }} required><option value="">Select crop</option>{cropOptions.map(name => <option key={name} value={name}>{name}</option>)}<option value="__other__">Other crop — type name</option></select>{customCrop && <input aria-label="Enter crop name" value={values.crop} onChange={event => { set("crop", event.target.value); setRecipeId(""); setDoseCalculated(false); }} required placeholder="Type crop name" style={{ marginTop: 8 }}/>}</label>
        {recipes.length > 0 && <label className="field"><span>ICAR crop recommendation</span><select value={selectedRecipe?.id ?? ""} onChange={event => { setRecipeId(event.target.value); setDoseCalculated(false); }}><option value="">Choose recommendation</option>{recipes.map(recipe => <option key={recipe.id} value={recipe.id}>{recipe.variant}</option>)}</select></label>}
        <label className="field"><span>Field area</span><input type="number" min="0.01" max="100000" step="0.01" value={areaHa} onChange={event => { setAreaHa(event.target.value); setDoseCalculated(false); }} required/><small className="muted">Hectares · product totals scale with area</small></label>
        <label className="field"><span>{t("growthStage")}</span><select value={values.growthStage} onChange={event => set("growthStage", event.target.value)} required><option value="">{t("select")}</option>{growthStages.map(stage => <option key={stage} value={stage}>{stage}</option>)}</select></label>
        <label className="field"><span>{t("soilType")}</span><select value={values.soilType} onChange={event => set("soilType", event.target.value)} required><option value="">{t("select")}</option>{soilTypes.map(soil => <option key={soil} value={soil}>{displayLabel(soil, locale)}</option>)}</select></label>
        <label className="field"><span>{t("nitrogen")}</span><input type="number" min="0" max="100000" step="0.01" value={values.nitrogenKgHa} onChange={event => set("nitrogenKgHa", event.target.value)} required placeholder="e.g. 240"/><small className="muted">Available N from soil test · kg/ha</small></label>
        <label className="field"><span>{t("phosphorus")}</span><input type="number" min="0" max="100000" step="0.01" value={values.phosphorusKgHa} onChange={event => set("phosphorusKgHa", event.target.value)} required placeholder="e.g. 18"/><small className="muted">Available P from soil test · kg/ha</small></label>
        <label className="field"><span>{t("potassium")}</span><input type="number" min="0" max="100000" step="0.01" value={values.potassiumKgHa} onChange={event => set("potassiumKgHa", event.target.value)} required placeholder="e.g. 150"/><small className="muted">Available K from soil test · kg/ha</small></label>
        <label className="field"><span>{t("soilPh")}</span><input type="number" min="0" max="14" step="0.01" value={values.soilPh} onChange={event => set("soilPh", event.target.value)} placeholder="0–14"/><small className="muted">{t("soilPh")} · 0–14 scale</small></label>
      </div>
      <p className="muted">Use laboratory values in kg/ha, not fertilizer bag quantities. {t("areaNote")}</p>
      <p className="muted">ICAR fertilizer plans use a bundled crop and state recommendation. Soil test values are screened separately and do not automatically alter the ICAR dose.</p>
      <button className="btn" disabled={busy}>{busy ? t("busy") : t("submit")}</button>
      {error && <p role="alert" className="error-message">{error}</p>}
    </form>

    {report && <SoilReport report={report}/>}

    <section className="panel soil-health-report" aria-live="polite">
      <p className="crop-advice-kicker">OFFLINE ICAR FERTILIZER CALCULATOR</p>
      <h2>Urea · DAP · MOP plan</h2>
      {!selectedRecipe ? <>
        <p className="muted">{values.crop && values.state ? `No bundled ICAR dose is available for ${values.crop} in ${values.state}. You can still calculate offline using the exact N, P₂O₅ and K₂O rates from this field’s Soil Health Card or KVK recommendation.` : "Select any state and crop, then enter the rates from the field’s Soil Health Card or KVK recommendation."} This mode calculates product quantities; it does not invent a crop dose.</p>
        <div className="soil-health-grid">
          <label className="field"><span>Recommended Nitrogen (N)</span><input type="number" min="0" step="0.01" value={manualRates.n} onChange={event => setManual("n", event.target.value)} placeholder="kg/ha"/><small className="muted">From your crop recommendation · kg N/ha</small></label>
          <label className="field"><span>Recommended Phosphorus (P₂O₅)</span><input type="number" min="0" step="0.01" value={manualRates.p2o5} onChange={event => setManual("p2o5", event.target.value)} placeholder="kg/ha"/><small className="muted">Enter P₂O₅, not elemental P · kg/ha</small></label>
          <label className="field"><span>Recommended Potassium (K₂O)</span><input type="number" min="0" step="0.01" value={manualRates.k2o} onChange={event => setManual("k2o", event.target.value)} placeholder="kg/ha"/><small className="muted">Enter K₂O, not elemental K · kg/ha</small></label>
          <label className="field"><span>Basal N share (%)</span><input type="number" min="0" max="100" step="1" value={manualRates.basalN} onChange={event => setManual("basalN", event.target.value)} placeholder="e.g. 50"/></label>
          <label className="field"><span>Basal P₂O₅ share (%)</span><input type="number" min="0" max="100" step="1" value={manualRates.basalP} onChange={event => setManual("basalP", event.target.value)} placeholder="e.g. 100"/></label>
          <label className="field"><span>Basal K₂O share (%)</span><input type="number" min="0" max="100" step="1" value={manualRates.basalK} onChange={event => setManual("basalK", event.target.value)} placeholder="e.g. 100"/></label>
          <label className="field"><span>Remaining fertilizer timing</span><input value={manualRates.topdressLabel} onChange={event => setManual("topdressLabel", event.target.value)} placeholder="e.g. First irrigation"/><small className="muted">Remaining nutrient share is scheduled here.</small></label>
        </div>
        {!doseCalculated && <p className="muted">Enter the recommended nutrient rates above, then calculate to see product quantities.</p>}
        {doseCalculated && manualInputsValid && !manualPlan && <p role="alert" className="error-message">DAP alone supplies more nitrogen than the entered total N target. Confirm the SHC values or use a crop recommendation with another phosphorus fertilizer.</p>}
        {doseCalculated && manualPlan && <>
          <h3>Offline calculation for {values.crop} · {values.district}, {values.state}</h3>
          <p>For {areaHa} ha: <strong>Urea {manualPlan.total.urea.toFixed(1)} kg · DAP {manualPlan.total.dap.toFixed(1)} kg · MOP {manualPlan.total.mop.toFixed(1)} kg</strong></p>
          <div className="table-wrap"><table className="table"><thead><tr><th>Application time</th><th>Urea (kg)</th><th>DAP (kg)</th><th>MOP (kg)</th></tr></thead><tbody>{manualPlan.schedule.map(split => <tr key={split.label}><td>{split.label}</td><td>{split.urea.toFixed(1)}</td><td>{split.dap.toFixed(1)}</td><td>{split.mop.toFixed(1)}</td></tr>)}</tbody></table></div>
          <p className="muted">Custom offline calculation from the rates and split you entered. Check the fertilizer grades on product bags; this result is not an ICAR-generated dose.</p>
        </>}
      </> : !doseCalculated ? <p className="muted">Select the ICAR recommendation and field area, then calculate to generate the dose.</p> : !fertilizerPlan ? <p className="muted">Enter a valid field area to calculate product quantities.</p> : <>
        <h3>{selectedRecipe.variant}</h3>
        <p>{selectedRecipe.conditions}</p>
        <p>For {areaHa} ha, total product requirement: <strong>Urea {fertilizerPlan.total.urea.toFixed(1)} kg · DAP {fertilizerPlan.total.dap.toFixed(1)} kg · MOP {fertilizerPlan.total.mop.toFixed(1)} kg</strong></p>
        <div className="table-wrap"><table className="table"><thead><tr><th>Application time</th><th>Urea (kg)</th><th>DAP (kg)</th><th>MOP (kg)</th></tr></thead><tbody>{fertilizerPlan.schedule.map((split, index) => <tr key={`${split.label}-${index}`}><td>{split.label}</td><td>{split.urea.toFixed(1)}</td><td>{split.dap.toFixed(1)}</td><td>{split.mop.toFixed(1)}</td></tr>)}</tbody></table></div>
        <p className="muted">Calculated from standard fertilizer grades in the bundled dataset. Quantities are rounded for display only; follow local soil-test advice and fertilizer label. Application schedule is the ICAR source schedule.</p>
        <a href={selectedRecipe.source.url} target="_blank" rel="noreferrer">Source: {selectedRecipe.source.title} (included for reference; calculation works offline)</a>
      </>}
      <button type="button" className="btn" disabled={!Number.isFinite(Number(areaHa)) || Number(areaHa) <= 0 || (!selectedRecipe && !manualInputsValid)} onClick={() => setDoseCalculated(true)}>{selectedRecipe ? "Calculate ICAR dose" : "Calculate product quantities"}</button>
    </section>

    <section className="panel soil-health-reference">
      <h2 style={{ marginTop: 0 }}>How this offline check works</h2>
      <p>It classifies the N, P and K test results using the general nutrient bands in the Government of India Soil Health Card Portal Teacher&apos;s Manual. The report uses crop and growth stage to frame what to check on your own crop-specific card. It does not calculate a fertilizer product or application dose.</p>
      <p className="muted">The “Fill demo values” button uses synthetic example values to illustrate the form; these are not a real farmer&apos;s sample or an issued card. Local laboratory interpretations and state recommendations take precedence.</p>
      <a href="https://soilhealth.dac.gov.in/files/Manual/140723DraftTeacherManual_PDF.pdf" target="_blank" rel="noreferrer">Source: Soil Health Card Portal Teacher&apos;s Manual for Soil</a>
    </section>

    <section className="panel soil-health-history">
      <h2 style={{ marginTop: 0 }}>{t("history")}</h2>
      {history.length === 0 ? <p className="muted">No saved soil checks yet. Submit the form to store a local copy in your account.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Location</th><th>Crop · stage</th><th>N / P / K (kg/ha)</th><th>pH</th><th>N / P / K rating</th><th>Action</th></tr></thead><tbody>{history.map(item => {
        const input = item.input ?? {};
        const nutrients = Array.isArray(item.result?.nutrients) ? item.result.nutrients : [];
        const ratings = nutrients.map(nutrient => nutrient?.rating).filter(Boolean).join(" / ") || "Older result format";
        return <tr key={item.id}><td>{item.createdAt && !Number.isNaN(Date.parse(item.createdAt)) ? new Date(item.createdAt).toLocaleDateString("en-IN") : "—"}</td><td>{input.district || "—"}{input.state ? `, ${input.state}` : ""}</td><td>{input.crop || "—"}{input.growthStage ? ` · ${input.growthStage}` : ""}</td><td>{input.nitrogenKgHa ?? "—"} / {input.phosphorusKgHa ?? "—"} / {input.potassiumKgHa ?? "—"}</td><td>{input.soilPh ?? "—"}</td><td>{ratings}</td><td><button type="button" className="subtle-link danger-link" disabled={deletingId === item.id} onClick={() => void deleteSavedCheck(item.id)}>{deletingId === item.id ? "Deleting…" : "Delete"}</button></td></tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}

function SoilReport({ report }: { report: Report }) {
  return <section className="panel soil-health-report" aria-live="polite">
    <p className="crop-advice-kicker">OFFLINE SOIL HEALTH SUMMARY</p>
    <h2>{report.location} · {report.crop}</h2>
    <p className="muted">{report.growthStage} stage · {report.soilType} soil</p>
    <div className="table-wrap"><table className="table"><thead><tr><th>Parameter</th><th>Test value</th><th>Screening class</th><th>What to check</th></tr></thead><tbody>
      {report.nutrients.map(item => <tr key={item.name}><td>{item.name}</td><td>{item.value} {item.unit}</td><td><strong>{item.rating}</strong><small className="muted" style={{ display: "block" }}>Band: {item.range} kg/ha</small></td><td>{item.guidance}</td></tr>)}
      {report.ph && <tr><td>Soil pH</td><td>{report.ph.value}</td><td><strong>{report.ph.rating}</strong></td><td>{report.ph.guidance}</td></tr>}
    </tbody></table></div>
    <p className="soil-health-caution">{report.note}</p>
    <a href={report.source.sourceUrl} target="_blank" rel="noreferrer">Reference: {report.source.source}</a>
  </section>;
}
