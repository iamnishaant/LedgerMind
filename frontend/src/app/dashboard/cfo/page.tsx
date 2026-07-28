"use client";
/**
 * AI CFO — Phase 7.
 * Renders /api/v1/cfo/brief: a narrative, prioritized brief synthesized from
 * this month's expenses + budgets + forecast + GST — all numbers precomputed
 * deterministically; the LLM only reasons over and prioritizes them.
 */
import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, AlertTriangle, TrendingUp, ListChecks, RefreshCw, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

interface CfoItem { title: string; detail: string }
interface Brief {
  headline: string;
  risks: CfoItem[];
  opportunities: CfoItem[];
  actions: string[];
}

export default function CfoPage() {
  const { businessId, authedFetch } = useBusiness();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    // The brief is a full LLM synthesis and can legitimately take ~30s on the
    // free tier. Bound it anyway so a dead backend surfaces an error instead of
    // spinning against the browser's multi-minute default.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const r = await authedFetch(
        `/api/v1/cfo/brief?business_id=${businessId}${refresh ? "&refresh=true" : ""}`,
        { signal: ctrl.signal },
      );
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Request failed");
      const d = await r.json();
      setBrief(d.brief);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      setError(err.name === "AbortError"
        ? "The brief took too long to generate. Try again in a moment."
        : err.message ?? "Couldn't reach the CFO agent — is the backend running?");
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, [businessId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 10 }}>
            <BrainCircuit size={24} color="var(--color-primary-glow)" /> AI CFO
          </h1>
          <p style={{ color: "var(--color-text-dim)", marginTop: 4 }}>
            A prioritized brief synthesized from your budgets, forecast, and GST position.
          </p>
        </div>
        <button onClick={() => load(true)} disabled={loading} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 7, opacity: loading ? 0.6 : 1 }}>
          <RefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} /> Refresh brief
        </button>
      </Reveal>

      {loading ? (
        <BriefLoading />
      ) : error ? (
        <div className="glass-card" style={{ padding: 32, textAlign: "center" }}>
          <p style={{ color: "var(--color-danger)", marginBottom: 14 }}>{error}</p>
          <button onClick={() => load(true)} className="btn-primary">Try again</button>
        </div>
      ) : !brief ? null : (
        <AnimatePresence mode="wait">
          <motion.div key={brief.headline} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            {/* Headline */}
            <Reveal className="ring-card" style={{ padding: 24, marginBottom: 20, display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg, #b8862e, #a8541f)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px -4px rgba(184,134,46,0.4)" }}>
                <BrainCircuit size={20} color="#fff" />
              </div>
              <p style={{ fontSize: "1.05rem", color: "var(--color-text)", fontWeight: 500, lineHeight: 1.5, paddingTop: 6 }}>{brief.headline}</p>
            </Reveal>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              {/* Risks */}
              <div className="glass-card" style={{ padding: 20 }}>
                <SectionHeader icon={AlertTriangle} color="var(--color-danger)" label="Risks" />
                {brief.risks.length === 0 ? (
                  <EmptyNote text="Nothing flagged as risky right now." />
                ) : (
                  <Stagger style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {brief.risks.map((r, i) => (
                      <StaggerItem key={i}>
                        <ItemCard color="var(--color-danger)" title={r.title} detail={r.detail} />
                      </StaggerItem>
                    ))}
                  </Stagger>
                )}
              </div>

              {/* Opportunities */}
              <div className="glass-card" style={{ padding: 20 }}>
                <SectionHeader icon={TrendingUp} color="var(--color-success)" label="Opportunities" />
                {brief.opportunities.length === 0 ? (
                  <EmptyNote text="No specific opportunities surfaced yet." />
                ) : (
                  <Stagger style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {brief.opportunities.map((o, i) => (
                      <StaggerItem key={i}>
                        <ItemCard color="var(--color-success)" title={o.title} detail={o.detail} />
                      </StaggerItem>
                    ))}
                  </Stagger>
                )}
              </div>
            </div>

            {/* Actions */}
            <Reveal delay={0.05} className="glass-card" style={{ padding: 20 }}>
              <SectionHeader icon={ListChecks} color="var(--color-primary-glow)" label="Recommended actions" />
              {brief.actions.length === 0 ? (
                <EmptyNote text="No actions recommended right now." />
              ) : (
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {brief.actions.map((a, i) => (
                    <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                        background: "rgba(184,134,46,0.14)", color: "var(--color-primary-glow)", fontSize: "0.72rem", fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{i + 1}</span>
                      <span style={{ fontSize: "0.88rem", color: "var(--color-text)", lineHeight: 1.5, paddingTop: 1 }}>{a}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Reveal>
          </motion.div>
        </AnimatePresence>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SectionHeader({ icon: Icon, color, label }: { icon: React.ComponentType<{ size?: number; color?: string }>; color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <Icon size={16} color={color} />
      <h2 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--color-text)" }}>{label}</h2>
    </div>
  );
}

function ItemCard({ color, title, detail }: { color: string; title: string; detail: string }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: `${color}0d`, border: `1px solid ${color}26` }}>
      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text)", marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", lineHeight: 1.5 }}>{detail}</div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p style={{ fontSize: "0.82rem", color: "var(--color-text-dim)", fontStyle: "italic" }}>{text}</p>;
}

/**
 * Loading state with an elapsed counter.
 *
 * The brief is a full LLM synthesis and can legitimately take ~30s on the free
 * tier. An indefinite spinner is indistinguishable from a hang, so show the
 * clock running and set expectations as it climbs.
 */
function BriefLoading() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const note = secs < 10
    ? "Reading your expenses, budgets, forecast and GST position…"
    : secs < 30
      ? "Synthesizing the brief — this usually takes about half a minute."
      : "Still working. The free-tier model is slower under load.";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 64, color: "var(--color-text-dim)" }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}>
        <Sparkles size={28} color="var(--color-primary-glow)" />
      </motion.div>
      <p style={{ fontSize: "0.88rem", color: "var(--color-text)" }}>The CFO is reviewing your books…</p>
      <p style={{ fontSize: "0.8rem", textAlign: "center", maxWidth: 380 }}>{note}</p>
      <p className="mono" style={{ fontSize: "0.75rem" }}>{secs}s</p>
    </div>
  );
}
