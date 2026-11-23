"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bot, CalendarDays, CloudSun, FileChartColumn, FlaskConical, House,
  Map, PackageCheck, ShieldCheck, Sprout, Store, Wallet, Wheat,
  Droplets, type LucideIcon,
} from "lucide-react";
import { useAppShell } from "./app-shell";

type NavItem = { icon: LucideIcon; label: string; href: string };
type NavGroup = { label: string; links: NavItem[] };

export const groups: readonly NavGroup[] = [
  { label: "cultivation", links: [
    { icon: House, label: "overview", href: "/dashboard" },
    { icon: Map, label: "farms", href: "/farms" },
    { icon: Sprout, label: "crops", href: "/crops" },
    { icon: CalendarDays, label: "cropCalendar", href: "/crop-calendar" },
  ] },
  { label: "records", links: [
    { icon: Wallet, label: "expenses", href: "/expenses" },
    { icon: Droplets, label: "irrigation", href: "/irrigation" },
    { icon: Wheat, label: "harvest", href: "/production" },
  ] },
  { label: "cropProtection", links: [
    { icon: Sprout, label: "cropAdvice", href: "/recommendations" },
    { icon: FlaskConical, label: "fertilizer", href: "/fertilizer-recommendation" },
    { icon: ShieldCheck, label: "harvestLoss", href: "/crop-loss" },
  ] },
  { label: "storage", links: [
    { icon: PackageCheck, label: "inventory", href: "/inventory" },
  ] },
  { label: "marketGroup", links: [
    { icon: Store, label: "market", href: "/market" },
  ] },
  { label: "system", links: [
    { icon: FileChartColumn, label: "reports", href: "/reports" },
    { icon: CloudSun, label: "weather", href: "/weather" },
    { icon: Bot, label: "assistant", href: "/assistant" },
  ] },
];

export default function AppNav() {
  const pathname = usePathname();
  const t = useTranslations("Navigation");
  const { closeMobile } = useAppShell();

  return <nav id="main-sidebar-navigation" className="app-nav" aria-label="Main navigation">
    {groups.map((group) => <section className="nav-section" key={group.label}>
      <h2 className="nav-section-label">{t(group.label)}</h2>
      {group.links.map(({ icon: Icon, label, href }) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
        const text = t(href === "/crop-loss" ? "harvestLoss" : label);
        return <Link className={`navlink${active ? " active" : ""}`} aria-current={active ? "page" : undefined}
          key={href} href={href} title={text} onClick={closeMobile}>
          <span className="nav-icon"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="nav-label">{text}</span>
          {active && <span className="nav-active-mark" aria-hidden="true" />}
        </Link>;
      })}
    </section>)}
  </nav>;
}
