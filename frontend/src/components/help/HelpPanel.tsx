"use client";
/**
 * HelpPanel — the slide-in "?" panel. Renders the current route's contextual
 * help (purpose, when to use, workflow, best practices, tips, mistakes,
 * shortcuts, FAQs) from the content config. Accessible: role=dialog + aria-modal,
 * Esc to close, focus moves in on open and is restored on close. Theme-aware
 * (reads --color-* tokens, so it flips with light/dark).
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Clock, ListOrdered, Sparkles, Lightbulb, AlertTriangle,
  Keyboard, HelpCircle, PlayCircle,
} from "lucide-react";
import { useHelp } from "@/lib/help/HelpProvider";
import { getHelp } from "@/lib/help/content";

export default function HelpPanel() {
  const { panelOpen, closePanel, startTour } = useHelp();
  const pathname = usePathname();
  const content = getHelp(pathname);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!panelOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panelRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      restoreFocusRef.current?.focus?.();
    };
  }, [panelOpen, closePanel]);

  return (
    <AnimatePresence>
      {panelOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closePanel}
            style={{ position: "fixed", inset: 0, background: "var(--color-overlay)", zIndex: 70 }}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog" aria-modal="true" aria-label={content ? `Help: ${content.title}` : "Help"}
            tabIndex={-1}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 71,
              width: "min(460px, 100vw)", background: "var(--color-surface)",
              borderLeft: "1px solid var(--color-stroke)",
              boxShadow: "var(--shadow-pop)",
              display: "flex", flexDirection: "column", outline: "none",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid var(--color-stroke)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: "1.5rem" }}>{content?.emoji ?? "❓"}</span>
                <div>
                  <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-warning)" }}>Help</div>
                  <div className="serif" style={{ fontSize: "1.2rem", color: "var(--color-text)" }}>{content?.title ?? "This page"}</div>
                </div>
              </div>
              <button onClick={closePanel} aria-label="Close help"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-dim)", padding: 6, borderRadius: 8, display: "flex" }}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 22 }}>
              {!content ? (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
                  No page-specific help yet. Use the navigation on the left to explore, or replay the product tour below.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: "0.95rem", color: "var(--color-text)", lineHeight: 1.6 }}>{content.purpose}</p>

                  <Section icon={Clock} title="When to use it">
                    <p style={bodyText}>{content.whenToUse}</p>
                  </Section>

                  <Section icon={ListOrdered} title="Step-by-step">
                    <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                      {content.workflow.map((step, i) => (
                        <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <span style={numBadge}>{i + 1}</span>
                          <span style={bodyText}>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </Section>

                  <Section icon={Sparkles} title="Best practices">
                    <Bullets items={content.bestPractices} color="var(--color-success)" />
                  </Section>

                  <Section icon={Lightbulb} title="Tips">
                    <Bullets items={content.tips} color="var(--color-primary)" />
                  </Section>

                  <Section icon={AlertTriangle} title="Common mistakes">
                    <Bullets items={content.commonMistakes} color="var(--color-danger)" />
                  </Section>

                  {content.shortcuts && content.shortcuts.length > 0 && (
                    <Section icon={Keyboard} title="Keyboard shortcuts">
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {content.shortcuts.map((s, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <kbd style={kbdStyle}>{s.keys}</kbd>
                            <span style={bodyText}>{s.action}</span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  <Section icon={HelpCircle} title="FAQs">
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {content.faqs.map((f, i) => (
                        <div key={i}>
                          <div style={{ fontSize: "0.86rem", fontWeight: 600, color: "var(--color-text)", marginBottom: 3 }}>{f.q}</div>
                          <div style={{ ...bodyText, color: "var(--color-text-muted)" }}>{f.a}</div>
                        </div>
                      ))}
                    </div>
                  </Section>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--color-stroke)", display: "flex", gap: 10 }}>
              <button onClick={startTour} className="btn-ghost" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, fontWeight: 600 }}>
                <PlayCircle size={16} /> Replay product tour
              </button>
              <button onClick={closePanel} className="btn-primary">Close</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const bodyText: React.CSSProperties = { fontSize: "0.88rem", color: "var(--color-text)", lineHeight: 1.55 };
const numBadge: React.CSSProperties = {
  flexShrink: 0, width: 22, height: 22, borderRadius: 7, marginTop: 1,
  background: "rgba(184,134,46,0.16)", color: "var(--color-primary-glow)", fontSize: "0.72rem", fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const kbdStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "var(--color-text)",
  background: "var(--color-surface-2)", border: "1px solid var(--color-stroke)", borderBottomWidth: 2,
  borderRadius: 6, padding: "2px 8px", minWidth: 24, textAlign: "center",
};

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ size?: number; color?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-dim)", marginBottom: 10 }}>
        <Icon size={14} color="var(--color-primary-glow)" /> {title}
      </h3>
      {children}
    </section>
  );
}

function Bullets({ items, color }: { items: string[]; color: string }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: color, marginTop: 7 }} />
          <span style={bodyText}>{it}</span>
        </li>
      ))}
    </ul>
  );
}
