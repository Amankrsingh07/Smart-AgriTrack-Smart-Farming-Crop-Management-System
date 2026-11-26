import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { logout } from "../actions";
import AppNav from "./app-nav";
import { AppShell, SidebarCollapseButton } from "./app-shell";
import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import AgriTrackMark from "../agritrack-mark";
import AppTopbar from "./app-topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/");
  const t = await getTranslations("Navigation");
  return (
    <AppShell>
      <aside id="main-sidebar" className="sidebar app-sidebar">
        <div className="sidebar-heading">
          <Link href="/dashboard" className="app-brand" title="AgriTrack">
            <span className="app-brand-mark">
              <AgriTrackMark />
            </span>
            <span className="app-brand-copy">
              AgriTrack<small>FARM MANAGEMENT</small>
            </span>
          </Link>
          <SidebarCollapseButton />
        </div>
        <AppNav />
        <div className="sidebar-bottom">
          <Link href="/profile" className="profile-chip" title={user.name}>
            <span className="avatar-mark">
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="profile-copy">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
            <span className="profile-more">···</span>
          </Link>
          <form action={logout}>
            <button className="logout-button" title={t("signOut")}>
              <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
              <span className="logout-label">{t("signOut")}</span>
            </button>
          </form>
        </div>
      </aside>
      <main className="app-main">
        <AppTopbar name={user.name} />
        <div className="content">{children}</div>
      </main>
    </AppShell>
  );
}
