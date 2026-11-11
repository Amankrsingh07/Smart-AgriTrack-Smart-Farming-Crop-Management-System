import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { logout } from "../actions";
import AppNav from "./app-nav";
import LanguageSelector from "./language-selector";
import { getTranslations } from "next-intl/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/");
  const t = await getTranslations("Navigation");
  return <div className="layout app-layout">
    <aside className="sidebar app-sidebar">
      <Link href="/dashboard" className="app-brand"><span className="app-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M5 10.5c6.2 1.4 12.8 1.4 22 0M5 16c6.2 1.4 12.8 1.4 22 0M5 21.5c6.2 1.4 12.8 1.4 22 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/><path d="M8 7v18M16 8v16M24 7v18" stroke="currentColor" strokeWidth=".8" opacity=".55"/></svg></span><span>AgriTrack<small>FARM MANAGEMENT</small></span></Link>
      <AppNav />
      <div className="sidebar-bottom">
        <Link href="/profile" className="profile-chip"><span className="avatar-mark">{user.name.trim().charAt(0).toUpperCase()}</span><span className="profile-copy"><strong>{user.name}</strong><small>{user.email}</small></span><span className="profile-more">···</span></Link>
        <form action={logout}><button className="logout-button"><span aria-hidden="true">↗</span> {t("signOut")}</button></form>
      </div>
    </aside>
      <main className="app-main"><header className="topbar"><span><i className="topbar-dot"/> AGRITRACK</span><div className="topbar-right"><LanguageSelector/><span className="topbar-date">{t("account")}</span><span className="topbar-avatar" aria-label={user.name}>{user.name.trim().charAt(0).toUpperCase()}</span></div></header><div className="content">{children}</div></main>
  </div>;
}
