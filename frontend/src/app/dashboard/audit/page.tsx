"use client";
/**
 * Audit Log — Phase 10 (Enterprise).
 * Read-only view over `agent_runs` — every OCR/Accounting/Fraud/Budget Monitor
 * run, per receipt, with its outcome. Nothing new is written here; this page
 * just surfaces data every agent has already been recording since Phase 1.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Search, CheckCircle2, XCircle, Clock3, HelpCircle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

interface AgentRun {
  id: string;
  receipt_id: string | null;
  agent_name: string;
  status: "started" | "completed" | "failed" | "awaiting_human";
  output_payload?: Record<string, unknown> | null;
  error_message?: string | null;
  created_at: string;
}

interface Summary {
  total_runs: number;
  failed_runs: number;
  success_rate: number;
  by_agent: Record<string, number>;
  by_status: Record<string, number>;
}

const EMPTY_SUMMARY: Summary = {
  total_runs: 0, failed_runs: 0, success_rate: 0, by_agent: {}, by_status: {},
};

const STATUS_META: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  completed: { label: "completed", color: "var(--color-success)", icon: CheckCircle2 },
  failed: { label: "failed", color: "var(--color-danger)", icon: XCircle },
  started: { label: "started", color: "var(--color-text-dim)", icon: Clock3 },
  awaiting_human: { label: "awaiting human", color: "var(--color-warning)", icon: HelpCircle },
};

const AGENT_LABEL: Record<string, string> = {
  ocr_agent: "OCR", accounting_agent: "Accounting", fraud_agent: "Fraud",
  budget_monitor: "Budget Monitor", cfo_agent: "CFO",
};

function summarize(run: AgentRun): string {
  if (run.status === "failed") return run.error_message ?? "Failed — no error message recorded";
  const out = run.output_payload;
  if (!out) return "—";
  if (run.agent_name === "ocr_agent" && typeof out.confidence === "number")
    return `Confidence ${(out.confidence * 100).toFixed(0)}%`;
  if (run.agent_name === "accounting_agent" && out.category) return `Categorized: ${out.category}`;
  if (run.agent_name === "fraud_agent" && out.fraud_risk) return `Risk: ${out.fraud_risk}`;
  if (run.agent_name === "budget_monitor") {
    const alerts = Array.isArray(out.budget_alerts) ? out.budget_alerts.length : 0;
    return alerts > 0 ? `${alerts} budget alert${alerts > 1 ? "s" : ""}` : "No budget impact";
  }
  return JSON.stringify(out).slice(0, 60);
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function AuditPage() {
  const { businessId, authedFetch } = useBusiness();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState("All");
  const [activeStatus, setActiveStatus] = useState("All");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [runsRes, summaryRes] = await Promise.all([
        authedFetch(`/api/v1/audit?business_id=${businessId}&limit=100`),
        authedFetch(`/api/v1/audit/summary?business_id=${businessId}`),
      ]);
      if (!runsRes.ok || !summaryRes.ok) throw new Error(`Request failed (${runsRes.status})`);
      const runsData = await runsRes.json();
      const summaryData = await summaryRes.json();
      setRuns((runsData.runs ?? []) as AgentRun[]);
      setSummary((summaryData ?? EMPTY_SUMMARY) as Summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the audit log.");
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [businessId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const agents = useMemo(() => ["All", ...Array.from(new Set(runs.map(r => r.agent_name)))], [runs]);
  const statuses = useMemo(() => ["All", ...Array.from(new Set(runs.map(r => r.status)))], [runs]);

  const filtered = useMemo(() => {
    return runs.filter(r => {
      const agentOk = activeAgent === "All" || r.agent_name === activeAgent;
      const statusOk = activeStatus === "All" || r.status === activeStatus;
      const q = query.trim().toLowerCase();
      const qOk = !q || r.agent_name.toLowerCase().includes(q) || (r.receipt_id ?? "").toLowerCase().includes(q);
      return agentOk && statusOk && qOk;
    });
  }, [runs, activeAgent, activeStatus, query]);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 10 }}>
            <History size={24} color="var(--color-primary-glow)" /> Audit Log
          </h1>
          <p style={{ color: "var(--color-text-dim)", marginTop: "4px" }}>
            Every agent run across the pipeline — OCR, Accounting, Fraud, Budget Monitor.
          </p>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={15} color="var(--color-text-dim)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search agent or receipt…"
            style={{
              background: "var(--color-surface)", border: "1px solid var(--color-stroke)",
              borderRadius: 10, padding: "9px 14px 9px 34px", color: "var(--color-text)",
              fontSize: "0.85rem", outline: "none", width: 240,
            }}
          />
        </div>
      </Reveal>

      {error && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "rgba(178,58,46,0.08)", border: "1px solid rgba(178,58,46,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <XCircle size={18} color="var(--color-danger)" />
            <span style={{ fontSize: "0.85rem", color: "var(--color-danger)" }}>{error} — is the backend running?</span>
          </div>
          <button onClick={load} className="btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {/* Summary tiles */}
      <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "22px" }}>
        {[
          { label: "Total runs", value: summary.total_runs, suffix: "", icon: History, color: "#b8862e" },
          { label: "Success rate", value: summary.success_rate, suffix: "%", icon: CheckCircle2, color: "var(--color-success)" },
          { label: "Failed runs", value: summary.failed_runs, suffix: "", icon: XCircle, color: "var(--color-danger)" },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <StaggerItem key={t.label}>
              <div className="glass-card lift" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${t.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={18} color={t.color} />
                </div>
                <div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--color-text)" }}>
                    <AnimatedNumber value={t.value} suffix={t.suffix} />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-dim)" }}>{t.label}</div>
                </div>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {agents.map((a) => {
          const active = a === activeAgent;
          return (
            <button
              key={a}
              onClick={() => setActiveAgent(a)}
              style={{
                padding: "7px 14px", borderRadius: 999, fontSize: "0.8rem", fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s ease",
                border: `1px solid ${active ? "rgba(184,134,46,0.5)" : "var(--color-stroke)"}`,
                background: active ? "rgba(184,134,46,0.14)" : "transparent",
                color: active ? "#9c6b1f" : "var(--color-text-muted)",
              }}>
              {a === "All" ? "All agents" : (AGENT_LABEL[a] ?? a)}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {statuses.map((s) => {
          const active = s === activeStatus;
          const meta = s !== "All" ? STATUS_META[s] : undefined;
          return (
            <button
              key={s}
              onClick={() => setActiveStatus(s)}
              style={{
                padding: "6px 12px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s ease",
                border: `1px solid ${active ? `${meta?.color ?? "#b8862e"}55` : "var(--color-stroke)"}`,
                background: active ? `${meta?.color ?? "#b8862e"}18` : "transparent",
                color: active ? (meta?.color ?? "#9c6b1f") : "var(--color-text-dim)",
              }}>
              {s === "All" ? "All statuses" : (meta?.label ?? s)}
            </button>
          );
        })}
      </div>

      {/* Runs list */}
      <div className="glass-card" style={{ padding: "8px 8px 12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-stroke)" }}>
              {["Time", "Agent", "Status", "Receipt", "Summary"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontSize: "0.72rem", color: "var(--color-text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout" initial={false}>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--color-text-dim)" }}>Loading audit log…</td></tr>
              ) : error ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--color-text-dim)" }}>Couldn&apos;t load the audit log.</td></tr>
              ) : runs.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "48px 24px", textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(184,134,46,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <History size={24} color="var(--color-primary-glow)" />
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)" }}>No agent activity yet</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--color-text-dim)", maxWidth: 400 }}>Once you upload receipts, every OCR, Accounting, Fraud and Budget-Monitor run will appear here.</div>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--color-text-dim)" }}>No agent runs match this filter.</td></tr>
              ) : (
                filtered.map((r, i) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.started;
                  const StatusIcon = meta.icon;
                  return (
                    <motion.tr
                      key={r.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3) }}
                      style={{ borderBottom: "1px solid var(--color-stroke)" }}
                      onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = "rgba(184,134,46,0.04)"}
                      onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = "transparent"}>
                      <td style={{ padding: "13px 16px", fontSize: "0.8rem", color: "var(--color-text-dim)", whiteSpace: "nowrap" }}>{formatTime(r.created_at)}</td>
                      <td style={{ padding: "13px 16px", fontSize: "0.875rem", color: "var(--color-text)", fontWeight: 500 }}>{AGENT_LABEL[r.agent_name] ?? r.agent_name}</td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.7rem", fontWeight: 700, color: meta.color, background: `${meta.color}18`, padding: "3px 9px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                          <StatusIcon size={11} /> {meta.label}
                        </span>
                      </td>
                      <td className="mono" style={{ padding: "13px 16px", fontSize: "0.78rem", color: "var(--color-text-dim)" }}>
                        {r.receipt_id ? r.receipt_id.slice(0, 8) : "—"}
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: "0.82rem", color: "var(--color-text)" }}>{summarize(r)}</td>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}
