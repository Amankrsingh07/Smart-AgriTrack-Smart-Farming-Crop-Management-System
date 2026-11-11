import { db } from "@/lib/db";
import { getUser } from "@/lib/session";
import { addFarm, addField, deleteFarm, updateFarm } from "../../actions";
import ConfirmDeleteFarm from "./confirm-delete";
import LocationFields from "../location-fields";
import { getLocale, getTranslations } from "next-intl/server";
import { displayLabel } from "@/i18n/display-labels";

export default async function Farms({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await getUser();
  if (!user) return null;
  const t = await getTranslations("Farms");
  const locale = await getLocale();
  const [farms, query] = await Promise.all([
    db.farm.findMany({ where: { userId: user.id }, include: { fields: true }, orderBy: { createdAt: "desc" } }),
    searchParams,
  ]);

  return <>
    <p className="muted">{t("subtitle")}</p>
    <h1 style={{ marginTop: 0 }}>{t("title")}</h1>
    {query.error && <p role="alert" style={{ color: "#b42318" }}>{query.error.replaceAll("+", " ")}</p>}
    {query.saved && <p role="status" style={{ color: "var(--green)" }}>{query.saved.replaceAll("+", " ")}</p>}

    <div className="split">
      <form action={addFarm} className="panel">
        <h2 style={{ marginTop: 0 }}>{t("addFarm")}</h2>
        <Field label={t("farmName")}><input name="name" required maxLength={100} /></Field>
        <LocationFields idPrefix="new-farm" stateRequired districtRequired />
        <Field label={t("village")}><input name="village" /></Field>
        <Coordinates />
        <Field label={t("notesOptional")}><textarea name="description" rows={2} /></Field>
        <button className="btn">{t("saveFarm")}</button>
      </form>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>{t("addField")}</h2>
        {farms.length === 0 ? <p className="muted">{t("createFarmFirst")}</p> : <form action={addField}>
          <Field label={t("farm")}><select name="farmId" required>{farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
          <Field label={t("fieldName")}><input name="name" required /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label={t("area")}><input name="area" type="number" min="0.01" step="0.01" required /></Field>
            <Field label={t("unit")}><select name="areaUnit"><option value="acre">{t("acre")}</option><option value="hectare">{t("hectare")}</option></select></Field>
          </div>
          <Field label={t("soilType")}><select name="soilType" required><option value="">{t("selectSoil")}</option>{["Alluvial", "Black", "Red", "Laterite", "Sandy", "Clay", "Loamy", "Other"].map(x => <option key={x} value={x}>{displayLabel(x, locale)}</option>)}</select></Field>
          <Field label={t("soilTexture")}><select name="soilTexture"><option value="">{t("chooseKnown")}</option>{["Sandy", "Loamy", "Clayey"].map(x => <option key={x} value={x}>{displayLabel(x, locale)}</option>)}</select></Field>
          <Field label={t("source")}><select name="irrigationSource" required><option value="">{t("selectSource")}</option>{["Borewell", "Canal", "River", "Pond", "Rainwater Harvesting"].map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label={t("method")}><select name="irrigationMethod" required><option value="">{t("selectMethod")}</option>{["Drip", "Sprinkler", "Furrow", "Flood"].map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label={t("waterAvailability")}><select name="waterAvailability"><option value="LOW">{t("low")}</option><option value="MEDIUM">{t("medium")}</option><option value="HIGH">{t("high")}</option></select></Field>
          <button className="btn">{t("saveField")}</button>
        </form>}
      </div>
    </div>

    <section className="panel" style={{ marginTop: 18 }}>
      <h2 style={{ marginTop: 0 }}>{t("yourFarms")}</h2>
      {farms.length === 0 ? <p className="muted">{t("farmsAppear")}</p> : farms.map(f => <article key={f.id} style={{ padding: "18px 0", borderTop: "1px solid #edf0ec" }}>
        <h3 style={{ margin: "0 0 5px" }}>{f.name}</h3>
        <p className="muted" style={{ margin: "0 0 12px" }}>{[f.village, f.district, f.state].filter(Boolean).join(", ")}</p>
        {f.fields.length === 0 ? <span className="muted">{t("noFields")}</span> : <div style={{ overflowX: "auto" }}>
          <table className="table"><thead><tr><th>{t("field")}</th><th>{t("area")}</th><th>{t("soil")}</th><th>{t("texture")}</th><th>{t("source")}</th><th>{t("method")}</th><th>{t("water")}</th></tr></thead>
            <tbody>{f.fields.map(x => <tr key={x.id}><td>{x.name}</td><td>{x.area.toString()} {displayLabel(x.areaUnit === "acre" ? "Acre" : "Hectare", locale)}</td><td>{displayLabel(x.soilType, locale)}</td><td>{x.soilTexture ? displayLabel(x.soilTexture, locale) : t("notSet")}</td><td>{x.irrigationSource ? displayLabel(x.irrigationSource, locale) : t("notSet")}</td><td>{displayLabel(x.irrigationMethod, locale)}</td><td>{displayLabel(x.waterAvailability.toLowerCase(), locale)}</td></tr>)}</tbody>
          </table>
        </div>}
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: "var(--green)", fontWeight: 650 }}>{t("edit")}</summary>
          <form action={updateFarm} style={{ maxWidth: 680, marginTop: 12 }}>
            <input type="hidden" name="id" value={f.id} />
            <Field label="Farm name"><input name="name" required maxLength={100} defaultValue={f.name} /></Field>
            <LocationFields idPrefix={`edit-farm-${f.id}`} stateValue={f.state} districtValue={f.district} stateRequired districtRequired />
            <Field label={t("village")}><input name="village" defaultValue={f.village ?? ""} /></Field>
            <Coordinates latitude={f.latitude?.toString() ?? ""} longitude={f.longitude?.toString() ?? ""} />
            <Field label="Notes"><textarea name="description" rows={2} defaultValue={f.description ?? ""} /></Field>
            <button className="btn">{t("saveChanges")}</button>
          </form>
        </details>
        <form action={deleteFarm} style={{ marginTop: 12 }}>
          <input type="hidden" name="id" value={f.id} />
          <ConfirmDeleteFarm farmName={f.name} />
        </form>
      </article>)}
    </section>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

function Coordinates({ latitude = "", longitude = "" }: { latitude?: string; longitude?: string }) {
  // The coordinates are optional until verified farm coordinates are available.
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
    <Field label="Latitude (optional)"><input name="latitude" type="number" min="-90" max="90" step="0.000001" defaultValue={latitude} /></Field>
    <Field label="Longitude (optional)"><input name="longitude" type="number" min="-180" max="180" step="0.000001" defaultValue={longitude} /></Field>
  </div>;
}
