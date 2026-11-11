import { getUser } from "@/lib/session";
import { db } from "@/lib/db";
import { updateProfile } from "../../actions";
import LocationFields from "../location-fields";
import { getTranslations } from "next-intl/server";
import { languages } from "@/i18n/languages";

export default async function Profile({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await getUser();
  if (!user) return null;
  const t = await getTranslations("Profile");
  const [profile, query] = await Promise.all([
    db.farmerProfile.findUnique({ where: { userId: user.id } }),
    searchParams,
  ]);

  return <>
    <p className="muted">{t("subtitle")}</p>
    <h1 style={{ marginTop: 0 }}>{t("title")}</h1>
    {query.error && <p role="alert" style={{ color: "#b42318" }}>{query.error.replaceAll("+", " ")}</p>}
    {query.saved && <p role="status" style={{ color: "var(--green)" }}>{query.saved.replaceAll("+", " ")}</p>}
    <form action={updateProfile} className="panel" style={{ maxWidth: 680 }}>
      <h2 style={{ marginTop: 0 }}>{t("accountDetails")}</h2>
      <Field label={t("name")}><input name="name" required minLength={2} maxLength={80} defaultValue={user.name} /></Field>
      <Field label={t("email")}><input type="email" value={user.email} readOnly aria-describedby="email-note" /></Field>
      <small id="email-note" className="muted">{t("emailNote")}</small>
      <Field label={t("phone")}><input name="phone" type="tel" maxLength={30} defaultValue={user.phone ?? ""} /></Field>
      <Field label={t("language")}><select name="language" defaultValue={user.language}>{languages.map(language => <option key={language.code} value={language.code}>{language.native} — {language.label}</option>)}</select></Field>
      <h2>{t("preferredLocation")}</h2>
      <LocationFields idPrefix="profile" stateValue={profile?.state ?? ""} districtValue={profile?.district ?? ""} />
      <Field label={t("village")}><input name="village" maxLength={100} defaultValue={profile?.village ?? ""} /></Field>
      <Field label={t("season")}><select name="preferredSeason" defaultValue={profile?.preferredSeason ?? ""}><option value="">{t("notSet")}</option><option value="KHARIF">Kharif</option><option value="RABI">Rabi</option><option value="ZAID">Zaid</option></select></Field>
      <button className="btn">{t("save")}</button>
    </form>
    <p className="muted" style={{ maxWidth: 680, fontSize: 13, marginTop: 14 }}>Weather uses coordinates saved with a farm. Update farm coordinates in My farms & land to enable its forecast.</p>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}
