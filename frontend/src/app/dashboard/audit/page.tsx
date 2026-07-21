"use client";
/**
 * Audit Log — Phase 10 (Enterprise).
 * Read-only view over `agent_runs` — every OCR/Accounting/Fraud/Budget Monitor
 * run, per receipt, with its outcome. Nothing new is written here; this page
 * just surfaces data every agent has already been recording since Phase 1.
 */
import { useEffect, useMemo, useState } from "react";
import { History, Search, CheckCircle2, XCircle, Clock3, HelpCircle } from "lucide-react";
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

// ── Illustrative fallback data (used when the API is unreachable) ──
const SAMPLE: AgentRun[] = [
  { id: "r1", receipt_id: "8f2c1a90", agent_name: "ocr_agent", status: "completed", output_payload: { confidence: 0.94 }, created_at: "2026-07-21T09:12:00Z" },
  { id: "r2", receipt_id: "8f2c1a90", agent_name: "accounting_agent", status: "completed", output_payload: { category: "Software & Subscriptions" }, created_at: "2026-07-21T09:12:03Z" },
  { id: "r3", receipt_id: "8f2c1a90", agent_name: "fraud_agent", status: "completed", output_payload: { fraud_risk: "low" }, created_at: "2026-07-21T09:12:04Z" },
  { id: "r4", receipt_id: "8f2c1a90", agent_name: "budget_monitor", status: "completed", output_payload: { budget_alerts: [] }, created_at: "2026-07-21T09:12:04Z" },
  { id: "r5", receipt_id: "b71de203", agent_name: "ocr_agent", status: "completed", output_payload: { confidence: 0.61 }, created_at: "2026-07-20T15:40:00Z" },
  { id: "r6", receipt_id: "b71de203", agent_name: "accounting_agent", status: "completed", output_payload: { category: "Equipment" }, created_at: "2026-07-20T15:41:10Z" },
  { id: "r7", receipt_id: "b71de203", agent_name: "fraud_agent", status: "completed", output_payload: { fraud_risk: "high" }, created_at: "2026-07-20T15:41:11Z" },
  { id: "r8", receipt_id: "c93af114", agent_name: "ocr_agent", status: "failed", error_message: "Vision LLM timeout", created_at: "2026-07-19T11:05:00Z" },
];
const SAMPLE_SUMMARY: Summary = {
  total_runs: 8, failed_runs: 1, success_rate: 87.5,
  by_agent: { ocr_agent: 3, accounting_agent: 2, fraud_agent: 2, budget_monitor: 1 },
  by_status: { completed: 7, failed: 1 },
};

const STATUS_META: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  completed: { label: "completed", color: "#10b981", icon: CheckCircle2 },
  failed: { label: "failed", color: "#f87171", icon: XCircle },
  started: { label: "started", color: "#64748b", icon: Clock3 },
  awaiting_human: { label: "awaiting human", color: "#f59e0b", icon: HelpCircle },
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
  const [summary, setSummary] = useState<Summary>(SAMPLE_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [usingSample, setUsingSample] = useState(false);
  const [activeAgent, setActiveAgent] = useState("All");
  const [activeStatus, setActiveStatus] = useState("All");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [runsRes, summaryRes] = await Promise.all([
          authedFetch(`/api/v1/audit?business_id=${businessId}&limit=100`),
          authedFetch(`/api/v1/audit/summary?business_id=${businessId}`),
        ]);
        if (!runsRes.ok || !summaryRes.ok) throw new Error("bad status");
        const runsData = await runsRes.json();
        const summaryData = await summaryRes.json();
        if (cancelled) return;
        const rows: AgentRun[] = runsData.runs ?? [];
        if (rows.length === 0) { setRuns(SAMPLE); setSummary(SAMPLE_SUMMARY); setUsingSample(true); }
        else { setRuns(rows); setSummary(summaryData); }
      } catch {
        if (!cancelled) { setRuns(SAMPLE); setSummary(SAMPLE_SUMMARY); setUsingSample(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, authedFetch]);

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
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
            <History size={24} color="#818cf8" /> Audit Log
          </h1>
          <p style={{ color: "#64748b", marginTop: "4px" }}>
            Every agent run across the pipeline — OCR, Accounting, Fraud, Budget Monitor.
            {usingSample && <span style={{ color: "#f59e0b" }}> · showing sample data (backend offline)</span>}
          </p>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={15} color="#64748b" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search agent or receipt…"
            style={{
              background: "rgba(26,34,53,0.6)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10, padding: "9px 14px 9px 34px", color: "#f1f5f9",
              fontSize: "0.85rem", outline: "none", width: 240,
            }}
          />
        </div>
      </Reveal>

      {/* Summary tiles */}
      <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "22px" }}>
        {[
          { label: "Total runs", value: summary.total_runs, suffix: "", icon: History, color: "#6366f1" },
          { label: "Success rate", value: summary.success_rate, suffix: "%", icon: CheckCircle2, color: "#10b981" },
          { label: "Failed runs", value: summary.failed_runs, suffix: "", icon: XCircle, color: "#f87171" },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <StaggerItem key={t.label}>
              <div className="glass-card lift" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${t.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={18} color={t.color} />
                </div>
                <div>
                  <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#f1f5f9" }}>
                    <AnimatedNumber value={t.value} suffix={t.suffix} />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{t.label}</div>
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
                border: `1px solid ${active ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
                background: active ? "rgba(99,102,241,0.16)" : "transparent",
                color: active ? "#818cf8" : "#94a3b8",
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
                border: `1px solid ${active ? `${meta?.color ?? "#6366f1"}55` : "rgba(255,255,255,0.06)"}`,
                background: active ? `${meta?.color ?? "#6366f1"}18` : "transparent",
                color: active ? (meta?.color ?? "#818cf8") : "#64748b",
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
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Time", "Agent", "Status", "Receipt", "Summary"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontSize: "0.72rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout" initial={false}>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading audit log…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#64748b" }}>No agent runs match this filter.</td></tr>
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
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"}
                      onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = "transparent"}>
                      <td style={{ padding: "13px 16px", fontSize: "0.8rem", color: "#64748b", whiteSpace: "nowrap" }}>{formatTime(r.created_at)}</td>
                      <td style={{ padding: "13px 16px", fontSize: "0.875rem", color: "#f1f5f9", fontWeight: 500 }}>{AGENT_LABEL[r.agent_name] ?? r.agent_name}</td>
                      <td style={{ padding: "13px 16px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.7rem", fontWeight: 700, color: meta.color, background: `${meta.color}18`, padding: "3px 9px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                          <StatusIcon size={11} /> {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: "0.78rem", color: "#64748b", fontFamily: "monospace" }}>
                        {r.receipt_id ? r.receipt_id.slice(0, 8) : "—"}
                      </td>
                      <td style={{ padding: "13px 16px", fontSize: "0.82rem", color: "#cbd5e1" }}>{summarize(r)}</td>
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
