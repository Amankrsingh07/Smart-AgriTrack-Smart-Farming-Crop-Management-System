"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronRight, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { groups } from "./app-nav";
import { MobileSidebarButton } from "./app-shell";
import LanguageSelector from "./language-selector";

export default function AppTopbar({ name }: { name: string }) {
  const pathname = usePathname();
  const t = useTranslations("Navigation");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLDetailsElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = groups
    .flatMap((group) => group.links)
    .find(
      ({ href }) =>
        pathname === href ||
        (href !== "/dashboard" && pathname.startsWith(`${href}/`)),
    );
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return groups
      .flatMap((group) =>
        group.links.map((item) => ({
          ...item,
          group: t(group.label),
          text: t(item.href === "/crop-loss" ? "harvestLoss" : item.label),
        })),
      )
      .filter(
        (item) =>
          !normalized ||
          `${item.text} ${item.group}`.toLocaleLowerCase().includes(normalized),
      );
  }, [query, t]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.setAttribute("open", "");
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === "Escape") searchRef.current?.removeAttribute("open");
    };
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !searchRef.current?.contains(event.target)
      )
        searchRef.current?.removeAttribute("open");
    };
    window.addEventListener("keydown", handleShortcut);
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    setQuery("");
    searchRef.current?.removeAttribute("open");
  }, [pathname]);

  return (
    <header className="topbar">
      <MobileSidebarButton />
      <nav className="topbar-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard" className="topbar-home">
          AgriTrack
        </Link>
        {current && (
          <>
            <ChevronRight size={15} aria-hidden="true" />
            <span aria-current="page">
              {t(current.href === "/crop-loss" ? "harvestLoss" : current.label)}
            </span>
          </>
        )}
      </nav>
      <div className="topbar-right">
        <details className="topbar-search" ref={searchRef}>
          <summary
            aria-label={t("searchPages")}
            title={`${t("searchPages")} · Ctrl K`}
          >
            <Search size={18} strokeWidth={1.9} aria-hidden="true" />
          </summary>
          <div className="topbar-search-popover">
            <div className="topbar-search-input">
              <Search size={17} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPages")}
                aria-label={t("searchPages")}
              />
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  searchRef.current?.removeAttribute("open");
                }}
                aria-label={t("closeSearch")}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <nav
              className="topbar-search-results"
              aria-label={t("searchPages")}
            >
              {results.length ? (
                results.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.removeAttribute("open");
                    }}
                  >
                    <span>{item.text}</span>
                    <small>{item.group}</small>
                  </Link>
                ))
              ) : (
                <p className="muted">—</p>
              )}
            </nav>
          </div>
        </details>
        <Link
          className="topbar-icon-link"
          href="/crop-calendar"
          aria-label={t("cropCalendar")}
          title={t("cropCalendar")}
        >
          <Bell size={18} strokeWidth={1.9} aria-hidden="true" />
        </Link>
        <LanguageSelector />
        <Link href="/profile" className="topbar-date">
          {t("account")}
        </Link>
        <Link href="/profile" className="topbar-avatar" aria-label={name}>
          {name.trim().charAt(0).toUpperCase()}
        </Link>
      </div>
    </header>
  );
}
