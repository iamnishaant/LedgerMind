"use client";
/**
 * HelpProvider — global onboarding state (the "?" panel, the product tour, and
 * one-time page hints), persisted to localStorage so completion survives reloads
 * and isn't shown again unless the user asks.
 *
 * Mounted once in the dashboard layout; every page consumes it via useHelp().
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const TOUR_DONE_KEY = "lm.onboarding.tourDone.v1";
const HINT_SEEN_PREFIX = "lm.onboarding.hintSeen.v1:";

function lsGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch { /* private mode / quota */ }
}
function lsRemovePrefix(prefix: string) {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(prefix));
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch { /* ignore */ }
}

interface HelpContextValue {
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  tourActive: boolean;
  startTour: () => void;
  endTour: () => void;

  hintsVersion: number;               // bumps when hints are reset, to re-trigger them
  hasSeenHint: (route: string) => boolean;
  markHintSeen: (route: string) => void;
  resetHints: () => void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function HelpProvider({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [hintsVersion, setHintsVersion] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // First-run: auto-launch the tour once, after hydration (so it never runs on
  // the server and never double-fires).
  useEffect(() => {
    setHydrated(true);
    if (lsGet(TOUR_DONE_KEY) !== "1") {
      // slight delay lets the layout paint so spotlights measure correctly
      const t = setTimeout(() => setTourActive(true), 650);
      return () => clearTimeout(t);
    }
  }, []);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const togglePanel = useCallback(() => setPanelOpen((o) => !o), []);

  const startTour = useCallback(() => {
    setPanelOpen(false);
    setTourActive(true);
  }, []);
  const endTour = useCallback(() => {
    setTourActive(false);
    lsSet(TOUR_DONE_KEY, "1");
  }, []);

  const hasSeenHint = useCallback((route: string) => lsGet(HINT_SEEN_PREFIX + route) === "1", []);
  const markHintSeen = useCallback((route: string) => lsSet(HINT_SEEN_PREFIX + route, "1"), []);
  const resetHints = useCallback(() => {
    lsRemovePrefix(HINT_SEEN_PREFIX);
    setHintsVersion((v) => v + 1);
  }, []);

  const value = useMemo<HelpContextValue>(() => ({
    panelOpen, openPanel, closePanel, togglePanel,
    tourActive: tourActive && hydrated, startTour, endTour,
    hintsVersion, hasSeenHint, markHintSeen, resetHints,
  }), [panelOpen, openPanel, closePanel, togglePanel, tourActive, hydrated, startTour, endTour, hintsVersion, hasSeenHint, markHintSeen, resetHints]);

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelp() must be used inside <HelpProvider>");
  return ctx;
}
