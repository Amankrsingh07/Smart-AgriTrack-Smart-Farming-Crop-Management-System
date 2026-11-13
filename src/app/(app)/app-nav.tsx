"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const sections = [
  { label: "farm", links: [["⌂", "overview", "/dashboard"], ["▦", "farms", "/farms"], ["♧", "crops", "/crops"], ["▦", "cropCalendar", "/crop-calendar"], ["◉", "cropAdvice", "/recommendations"], ["⌁", "fertilizer", "/fertilizer-recommendation"]] },
  { label: "records", links: [["◷", "expenses", "/expenses"], ["↟", "irrigation", "/irrigation"], ["▤", "harvest", "/production"], ["▣", "inventory", "/inventory"], ["₹", "market", "/market"]] },
  { label: "tools", links: [["▧", "reports", "/reports"], ["☁", "weather", "/weather"], ["✦", "assistant", "/assistant"]] },
] as const;

export default function AppNav() {
  const pathname = usePathname();
  const t = useTranslations("Navigation");
  return <nav className="app-nav" aria-label="Main navigation">
    {sections.map(section => <div className="nav-section" key={section.label}>
      <p className="nav-section-label">{t(section.label)}</p>
      {section.links.map(([icon, label, href]) => <Link className={`navlink${pathname === href ? " active" : ""}`} aria-current={pathname === href ? "page" : undefined} key={href} href={href}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{t(label)}</span>{pathname === href && <span className="nav-active-mark"/>}</Link>)}
    </div>)}
  </nav>;
}
