"use client";
/**
 * HelpButton — a floating "?" always available in the corner. Opens the
 * contextual help panel for the current page. Also binds the global "?" keyboard
 * shortcut (ignored while typing in a field). Doubles as the product tour's
 * "help is always here" anchor via data-tour.
 */
import { useEffect } from "react";
import { HelpCircle } from "lucide-react";
import { useHelp } from "@/lib/help/HelpProvider";

export default function HelpButton() {
  const { togglePanel, openPanel, tourActive, panelOpen } = useHelp();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // "?" opens help, unless the user is typing or a modifier is held.
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      togglePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePanel]);

  // Hide while the tour is running so it doesn't compete with the spotlight.
  if (tourActive) return null;

  return (
    <button
      data-tour="help-button"
      onClick={openPanel}
      aria-label="Open help for this page"
      aria-haspopup="dialog"
      aria-expanded={panelOpen}
      title="Help (press ?)"
      style={{
        position: "fixed", right: 22, bottom: 22, zIndex: 40,
        width: 48, height: 48, borderRadius: "50%",
        background: "linear-gradient(180deg, #c9962e, #a8541f)",
        color: "#fff", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 8px 24px -6px rgba(168,84,31,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
        transition: "transform 0.15s ease, filter 0.2s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.filter = "brightness(1.05)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}
    >
      <HelpCircle size={22} />
    </button>
  );
}
