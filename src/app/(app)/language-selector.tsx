"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { languages, type LanguageCode } from "@/i18n/languages";

export default function LanguageSelector() {
  const locale = useLocale();
  const t = useTranslations("Common");
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  function change(language: string) {
    setError("");
    startTransition(async () => {
      try {
        localStorage.setItem("agritrack_locale", language);
        const response = await fetch("/api/preferences/language", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ language }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t("error"));
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("error"));
      }
    });
  }
  return (
    <label className="language-selector">
      <span>{t("language")}</span>
      <select
        aria-label={t("language")}
        disabled={busy}
        value={locale}
        onChange={(event) => change(event.target.value as LanguageCode)}
      >
        {languages.map((item) => (
          <option key={item.code} value={item.code}>
            {item.native}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="language-error">
          {error}
        </span>
      )}
    </label>
  );
}
