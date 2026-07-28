"use client";
/**
 * ProductTour — the first-run guided walkthrough. Spotlights stable navigation
 * chrome (via data-tour anchors) one step at a time with a positioned tooltip.
 * Auto-launches once for new users (see HelpProvider); replayable from the help
 * panel / Settings. Fully keyboard-driven: →/Enter next, ← prev, Esc skips.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useHelp } from "@/lib/help/HelpProvider";
import { TOUR_STEPS } from "@/lib/help/content";

interface Rect { top: number; left: number; width: number; height: number; }

const PAD = 6;
const CARD_W = 340;

export default function ProductTour() {
  const { tourActive, endTour } = useHelp();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  // Reset to the first step whenever the tour (re)starts.
  useEffect(() => { if (tourActive) setStep(0); }, [tourActive]);

  const measure = useCallback(() => {
    if (!current?.target) { setRect(null); return; }
    const el = document.querySelector(current.target) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [current]);

  useEffect(() => {
    if (!tourActive) return;
    // Bring the target into view, then measure once layout settles.
    if (current?.target) {
      document.querySelector(current.target)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    const t = setTimeout(measure, 120);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [tourActive, step, current, measure]);

  const next = useCallback(() => { if (isLast) endTour(); else setStep((s) => s + 1); }, [isLast, endTour]);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    if (!tourActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); endTour(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourActive, next, prev, endTour]);

  if (!tourActive || !current) return null;

  // Card placement relative to the spotlight (fallback: centered).
  const cardStyle: React.CSSProperties = (() => {
    if (!rect || current.placement === "center") {
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
    const place = current.placement ?? "bottom";
    const clampLeft = (l: number) => Math.max(16, Math.min(l, window.innerWidth - CARD_W - 16));
    if (place === "right") return { top: Math.max(16, rect.top), left: clampLeft(rect.left + rect.width + 16) };
    if (place === "left") return { top: Math.max(16, rect.top), left: clampLeft(rect.left - CARD_W - 16) };
    if (place === "top") return { top: Math.max(16, rect.top - 8), left: clampLeft(rect.left), transform: "translateY(-100%)" };
    return { top: rect.top + rect.height + 16, left: clampLeft(rect.left) };
  })();

  return (
    <div role="dialog" aria-modal="true" aria-label="Product tour" style={{ position: "fixed", inset: 0, zIndex: 90 }}>
      {/* Backdrop + spotlight */}
      {rect ? (
        <motion.div
          initial={false}
          animate={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          style={{
            position: "fixed", borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(36,28,21,0.62)",
            border: "2px solid rgba(201,150,46,0.9)",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(36,28,21,0.62)" }} />
      )}

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          style={{
            position: "fixed", width: CARD_W, maxWidth: "calc(100vw - 32px)",
            background: "var(--color-surface)", borderRadius: 16, padding: 20,
            boxShadow: "var(--shadow-pop)",
            border: "1px solid var(--color-stroke)",
            ...cardStyle,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--color-warning)", letterSpacing: "0.04em" }}>
              STEP {step + 1} OF {TOUR_STEPS.length}
            </span>
            <button onClick={endTour} aria-label="Skip tour"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-dim)", padding: 2, display: "flex" }}>
              <X size={16} />
            </button>
          </div>

          <h2 className="serif" style={{ fontSize: "1.2rem", color: "var(--color-text)", marginBottom: 8 }}>{current.title}</h2>
          <p style={{ fontSize: "0.9rem", color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: 18 }}>{current.body}</p>

          {/* Progress dots */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {TOUR_STEPS.map((_, i) => (
              <span key={i} style={{
                width: i === step ? 20 : 7, height: 7, borderRadius: 999,
                background: i === step ? "var(--color-primary)" : "var(--color-stroke-strong)",
                transition: "width 0.2s ease, background 0.2s ease",
              }} />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <button onClick={endTour} className="btn-ghost" style={{ padding: "8px 14px", fontSize: "0.82rem" }}>Skip tour</button>
            <div style={{ display: "flex", gap: 8 }}>
              {step > 0 && (
                <button onClick={prev} className="btn-ghost" style={{ padding: "8px 16px", fontSize: "0.85rem" }}>Back</button>
              )}
              <button onClick={next} className="btn-primary" style={{ padding: "8px 18px" }}>
                {isLast ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
