"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { displayLabel } from "@/i18n/display-labels";
import Link from "next/link";
import LocationFields from "../location-fields";
import { getOfflineCropAdvice } from "@/lib/crop-advice-catalog";

type Crop = { name: string; score: number; waterNeedMm: string; fertilizer: string; recommendation: string };
type Season = { season: string; crops: Crop[] };
type Advice = { seasons: Season[]; note: string; mode?: "online" | "offline" };

const soils = ["Alluvial", "Black (regur)", "Red", "Laterite", "Arid / desert", "Mountain / forest", "Sandy", "Clay", "Loamy", "Other"];

export default function CropAdvice() {
  const t = useTranslations("CropAdvice");
  const locale = useLocale();
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [soilType, setSoilType] = useState("");
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adviceMode, setAdviceMode] = useState<"online" | "offline">("online");
  const [requestedMode, setRequestedMode] = useState<"automatic" | "offline">("automatic");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setAdvice(null);
    try {
      if (requestedMode === "offline" || !navigator.onLine) {
        setAdvice(getOfflineCropAdvice(state, district, soilType));
        setAdviceMode("offline");
        return;
      }
      const response = await fetch("/api/crop-advice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ state, district, soilType }), signal: AbortSignal.timeout(45_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not get crop advice.");
      setAdvice(data as Advice);
      setAdviceMode(data.mode ?? "online");
    } catch {
      setAdvice(getOfflineCropAdvice(state, district, soilType));
      setAdviceMode("offline");
    } finally { setBusy(false); }
  }

  return <>
    <form className="crop-advice-form" onSubmit={submit}>
      <div className="crop-advice-fields crop-advice-inputs">
        <LocationFields idPrefix="advice" stateRequired districtRequired stateValue={state} districtValue={district} onLocationChange={(nextState, nextDistrict) => { setState(nextState); setDistrict(nextDistrict); }} stateLabel={t("state")} districtLabel={t("district")} />
        <div className="crop-advice-field"><label htmlFor="advice-soil">{t("soil")}</label><select id="advice-soil" value={soilType} onChange={event => setSoilType(event.target.value)} required><option value="">{t("selectSoil")}</option>{soils.map(soil => <option key={soil} value={soil}>{displayLabel(soil, locale)}</option>)}</select></div>
        <div className="crop-advice-field"><label htmlFor="advice-mode">Advice mode</label><select id="advice-mode" value={requestedMode} onChange={event => setRequestedMode(event.target.value as "automatic" | "offline")}><option value="automatic">Automatic · Gemini online, local fallback</option><option value="offline">Offline · local data only</option></select></div>
        <button className="crop-advice-submit" disabled={busy}>{busy ? t("busy") : <>{t("submit")} <span aria-hidden="true">→</span></>}</button>
      </div>
      <p className="crop-advice-form-note">{t("note")}</p>
    </form>
    {error && <p role="alert" className="crop-advice-error">{error}</p>}
    {advice && <section className="crop-advice-results">
      <div className="crop-advice-results-heading"><div><p className="crop-advice-kicker">SEASONAL MATCHES · {state} · {district}</p><h2>Crop recommendations</h2></div><span className="crop-advice-assistant">{adviceMode === "online" ? "Online · Gemini API" : "Offline · local crop data"}</span></div>
      {advice.seasons.map(season => <section className="crop-advice-season" key={season.season}><h3>{season.season}</h3><div className="crop-advice-crop-grid">{season.crops.map(crop => <article className="crop-advice-crop" key={crop.name}>
        <div className="crop-advice-crop-title"><h4>{crop.name}</h4><strong>{crop.score}%</strong></div><div className="crop-advice-match-meter"><span style={{ width: `${crop.score}%` }} /></div>
        <p>{crop.recommendation}</p><dl><div><dt>Season water need</dt><dd>{crop.waterNeedMm} mm</dd></div><div><dt>Fertilizer guidance</dt><dd>{crop.fertilizer}</dd></div></dl>
        <Link className="subtle-link" href={"/irrigation?cropName=" + encodeURIComponent(crop.name)}>Plan irrigation for this crop <span aria-hidden="true">→</span></Link>
      </article>)}</div></section>)}
      <p className="crop-advice-footnote">{advice.note}</p>
    </section>}
  </>;
}
