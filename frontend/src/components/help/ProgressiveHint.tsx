"use client";
/**
 * ProgressiveHint — a single, dismissable coach-mark shown the FIRST time a user
 * opens a feature page (progressive onboarding — guidance unlocks as you go, not
 * all at once). Seen state is persisted per route; "Reset page hints" in Settings
 * brings them back. Never shows while the product tour is running.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { useHelp } from "@/lib/help/HelpProvider";
import { getHint } from "@/lib/help/content";

export default function ProgressiveHint() {
  const pathname = usePathname();
  const { hasSeenHint, markHintSeen, hintsVersion, openPanel, tourActive } = useHelp();
  const [visible, setVisible] = useState(false);

  const hint = getHint(pathname);

  useEffect(() => {
    // Re-evaluate on route change or after a hints reset.
    if (hint && !hasSeenHint(pathname)) {
      const t = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [pathname, hint, hasSeenHint, hintsVersion]);

  const dismiss = () => { markHintSeen(pathname); setVisible(false); };
  const learnMore = () => { markHintSeen(pathname); setVisible(false); openPanel(); };

  return (
    <AnimatePresence>
      {visible && hint && !tourActive && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 16, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 16, x: "-50%" }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          style={{
            position: "fixed", bottom: 22, left: "50%", zIndex: 45,
            width: "min(460px, calc(100vw - 32px))",
            background: "var(--color-surface)", border: "1px solid rgba(184,134,46,0.35)",
            borderRadius: 14, padding: "14px 16px",
            boxShadow: "var(--shadow-pop)",
            display: "flex", gap: 12, alignItems: "flex-start",
          }}
        >
          <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: "rgba(184,134,46,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={17} color="var(--color-primary-glow)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--color-text)", marginBottom: 3 }}>{hint.title}</div>
            <div style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", lineHeight: 1.5 }}>{hint.body}</div>
            <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
              <button onClick={learnMore} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-primary-glow)", fontSize: "0.8rem", fontWeight: 600 }}>
                Learn more
              </button>
              <button onClick={dismiss} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-text-dim)", fontSize: "0.8rem", fontWeight: 600 }}>
                Got it
              </button>
            </div>
          </div>
          <button onClick={dismiss} aria-label="Dismiss hint"
            style={{ flexShrink: 0, background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-dim)", padding: 2, display: "flex" }}>
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
