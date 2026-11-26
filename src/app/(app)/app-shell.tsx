"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

type AppShellContextValue = {
  collapsed: boolean;
  mobileOpen: boolean;
  toggleCollapsed: () => void;
  openMobile: () => void;
  closeMobile: () => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context)
    throw new Error("App navigation controls must be inside AppShell.");
  return context;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const value = useMemo(
    () => ({
      collapsed,
      mobileOpen,
      toggleCollapsed: () => setCollapsed((current) => !current),
      openMobile: () => setMobileOpen(true),
      closeMobile,
    }),
    [collapsed, mobileOpen, closeMobile],
  );

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobile();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen, closeMobile]);

  return (
    <AppShellContext.Provider value={value}>
      <div
        id="smart-agritrack"
        className={`layout app-layout${collapsed ? " is-collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}
      >
        {mobileOpen && (
          <button
            className="sidebar-backdrop"
            aria-label="Close navigation menu"
            onClick={closeMobile}
          />
        )}
        {children}
      </div>
    </AppShellContext.Provider>
  );
}

export function SidebarCollapseButton() {
  const { collapsed, toggleCollapsed } = useAppShell();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      className="sidebar-collapse-button"
      type="button"
      onClick={toggleCollapsed}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      aria-controls="main-sidebar-navigation"
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

export function MobileSidebarButton() {
  const { openMobile, closeMobile, mobileOpen } = useAppShell();
  const Icon = mobileOpen ? X : Menu;
  return (
    <button
      className="mobile-sidebar-button"
      type="button"
      onClick={mobileOpen ? closeMobile : openMobile}
      aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={mobileOpen}
      aria-controls="main-sidebar-navigation"
    >
      <Icon size={21} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
