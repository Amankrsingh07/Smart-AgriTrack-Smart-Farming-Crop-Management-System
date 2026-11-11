"use client";

import { useState } from "react";
import { login, signup } from "./actions";
import { useTranslations } from "next-intl";

export default function AuthForms() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const t = useTranslations("Auth");
  const isSignup = mode === "signup";

  return <>
    <div className="auth-tabs" aria-label="Account access">
      <button type="button" aria-pressed={!isSignup} className={!isSignup ? "auth-tab active" : "auth-tab"} onClick={() => setMode("login")}>{t("signIn")}</button>
      <button type="button" aria-pressed={isSignup} className={isSignup ? "auth-tab active" : "auth-tab"} onClick={() => setMode("signup")}>{t("create")}</button>
    </div>

    {isSignup ? <form action={signup} className="auth-card auth-single-card">
      <div className="form-heading"><span className="form-step">02</span><div><h3>{t("createTitle")}</h3><p>{t("createNote")}</p></div></div>
      <div className="auth-fields-grid">
        <div className="field auth-field"><label htmlFor="signup-name">{t("name")}</label><input id="signup-name" name="name" autoComplete="name" placeholder={t("fullName")} minLength={2} maxLength={80} required /></div>
        <div className="field auth-field"><label htmlFor="signup-email">{t("email")}</label><input id="signup-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div>
        <div className="field auth-field"><label htmlFor="signup-phone">{t("phone")} <span className="optional-label">{t("optional")}</span></label><input id="signup-phone" name="phone" type="tel" autoComplete="tel" placeholder={t("phone")} /></div>
        <div className="field auth-field"><label htmlFor="signup-password">{t("password")}</label><input id="signup-password" name="password" type="password" minLength={8} autoComplete="new-password" placeholder={t("passwordHint")} required /></div>
      </div>
      <button className="btn auth-submit" type="submit">{t("create")} <span aria-hidden="true">→</span></button>
      <p className="auth-switch-copy">{t("already")} <button type="button" onClick={() => setMode("login")}>{t("signIn")}</button></p>
    </form> : <form action={login} className="auth-card auth-single-card">
      <div className="form-heading"><span className="form-step">01</span><div><h3>{t("back")}</h3><p>{t("signInNote")}</p></div></div>
      <div className="field auth-field"><label htmlFor="login-email">{t("email")}</label><input id="login-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div>
      <div className="field auth-field"><label htmlFor="login-password">{t("password")}</label><input id="login-password" name="password" type="password" autoComplete="current-password" placeholder={t("enterPassword")} required /></div>
      <button className="btn auth-submit" type="submit">{t("signIn")} <span aria-hidden="true">→</span></button>
      <p className="auth-switch-copy">{t("newUser")} <button type="button" onClick={() => setMode("signup")}>{t("createLink")}</button></p>
    </form>}
  </>;
}
