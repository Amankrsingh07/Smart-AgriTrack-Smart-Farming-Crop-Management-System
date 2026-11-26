import AuthForms from "./auth-forms";
import AgriTrackMark from "./agritrack-mark";
import {
  AlertCircle,
  CalendarDays,
  ChartNoAxesCombined,
  LockKeyhole,
  Map,
} from "lucide-react";
import { getUser } from "@/lib/session";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import LanguageSelector from "./(app)/language-selector";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getUser()) redirect("/dashboard");
  const { error } = await searchParams;
  const t = await getTranslations("Auth");
  const message = error ? t("authError") : "";

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-label={t("about")}>
        <div className="auth-story-top">
          <Link className="brand" href="/" aria-label="AgriTrack home">
            <span className="brand-mark">
              <AgriTrackMark />
            </span>
            <span>AgriTrack</span>
          </Link>
          <span className="story-tag">
            <span className="status-dot" /> {t("tag")}
          </span>
        </div>

        <div className="story-copy">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("headline")}</h1>
          <p className="story-description">{t("description")}</p>
          <div className="story-points">
            <div>
              <span className="point-icon">
                <Map size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span>
                <strong>{t("land")}</strong>
                <small>{t("landNote")}</small>
              </span>
            </div>
            <div>
              <span className="point-icon">
                <CalendarDays size={20} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span>
                <strong>{t("season")}</strong>
                <small>{t("seasonNote")}</small>
              </span>
            </div>
            <div>
              <span className="point-icon">
                <ChartNoAxesCombined
                  size={20}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </span>
              <span>
                <strong>{t("numbers")}</strong>
                <small>{t("numbersNote")}</small>
              </span>
            </div>
          </div>
        </div>

        <div className="land-art" aria-hidden="true">
          <svg
            viewBox="0 0 680 310"
            preserveAspectRatio="xMidYMid meet"
            fill="none"
          >
            <path
              d="M-20 189C89 118 149 255 269 176s167-108 260-59 116 50 181 15"
              stroke="#B7D99E"
              strokeOpacity=".45"
              strokeWidth="2"
            />
            <path
              d="M-20 214c109-71 169 66 289-13s167-108 260-59 116 50 181 15"
              stroke="#B7D99E"
              strokeOpacity=".55"
              strokeWidth="2"
            />
            <path
              d="M-20 239c109-71 169 66 289-13s167-108 260-59 116 50 181 15"
              stroke="#B7D99E"
              strokeOpacity=".7"
              strokeWidth="2"
            />
            <path
              d="M-20 264c109-71 169 66 289-13s167-108 260-59 116 50 181 15"
              stroke="#B7D99E"
              strokeOpacity=".48"
              strokeWidth="2"
            />
            <path
              d="M86 177c48-31 84-30 126-11m83 14c36-28 76-50 119-49m77 9c24 13 52 29 80 32"
              stroke="#ECF6E4"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="1 9"
            />
            <circle cx="390" cy="125" r="7" fill="#ECF6E4" />
            <circle
              cx="390"
              cy="125"
              r="15"
              stroke="#ECF6E4"
              strokeOpacity=".4"
            />
            <circle
              cx="390"
              cy="125"
              r="25"
              stroke="#ECF6E4"
              strokeOpacity=".2"
            />
          </svg>
          <div className="land-note">
            <span className="land-note-icon">✳</span>
            <span>
              <strong>{t("note")}</strong>
              <small>{t("noteSmall")}</small>
            </span>
          </div>
        </div>
        <footer className="story-footer">
          <span>{t("footer")}</span>
          <span>{t("footer2")}</span>
        </footer>
      </section>

      <section className="auth-area" aria-label="Sign in or create an account">
        <div className="auth-mobile-brand">
          <span className="brand-mark">
            <AgriTrackMark />
          </span>
          AgriTrack
        </div>
        <div className="auth-content">
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <LanguageSelector />
          </div>
          <div className="auth-heading">
            <p className="eyebrow">{t("welcome")}</p>
            <h2>{t("heading")}</h2>
            <p>{t("prompt")}</p>
          </div>
          {message && (
            <div className="auth-error" role="alert">
              <AlertCircle size={19} strokeWidth={1.9} aria-hidden="true" />
              <p>{message}</p>
            </div>
          )}
          <AuthForms />
          <p className="privacy-note">
            <LockKeyhole size={16} strokeWidth={1.8} aria-hidden="true" />{" "}
            {t("private")}
          </p>
          <p className="auth-legal">{t("legal")}</p>
        </div>
      </section>
    </main>
  );
}
