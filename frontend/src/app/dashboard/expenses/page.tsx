"use client";
/**
 * Expenses view — Phase 1.
 * Lists booked expenses with category filtering + a monthly summary.
 * Talks to the FastAPI backend (/api/v1/expenses) — real data only. When the
 * business has no expenses yet we show an empty state (never fake rows); when
 * the request fails we show an error with a Retry button.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Tag, AlertTriangle, ReceiptText, Upload, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

interface Expense {
  id: string;
  vendor_name: string | null;
  category: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  gst_amount?: number | null;
  is_duplicate?: boolean;
  description?: string | null;
  fraud_risk?: "low" | "medium" | "high" | null;
  metadata?: { fraud_reasons?: string[]; budget_alerts?: { budget_name: string; state: string }[] } | null;
}

const FRAUD_BADGE: Record<string, { label: string; color: string }> = {
  high: { label: "high risk", color: "var(--color-danger)" },
  medium: { label: "review", color: "var(--color-warning)" },
};

const CATEGORY_COLOR: Record<string, string> = {
  "Software & Subscriptions": "#b8862e",
  "Travel & Transport": "#4f7268",
  "Office Supplies": "#2f8f52",
  "Marketing & Advertising": "#b9791c",
  "Food & Dining": "#8a4a6b",
  "Utilities": "#6b4a8a",
};
const colorFor = (c: string | null) => CATEGORY_COLOR[c ?? ""] ?? "var(--color-text-dim)";

// Must match EXPENSE_CATEGORIES in backend/app/agents/accounting_agent.py.
const ALL_CATEGORIES = [
  "Food & Dining", "Travel & Transport", "Office Supplies", "Software & Subscriptions",
  "Utilities", "Medical & Health", "Marketing & Advertising", "Rent & Facilities",
  "Professional Services", "Equipment", "Other",
];

export default function ExpensesPage() {
  const { businessId, authedFetch } = useBusiness();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [justLearnedId, setJustLearnedId] = useState<string | null>(null);

  // Correct an expense's category. Optimistic update; records a learning signal
  // server-side (PATCH /expenses/{id}) so future receipts from this vendor
  // categorize the same way. Reverts on failure. Disabled on sample data.
  async function saveCategory(exp: Expense, category: string) {
    setEditingId(null);
    if (category === exp.category) return;
    const prev = exp.category;
    setExpenses(list => list.map(x => (x.id === exp.id ? { ...x, category } : x)));
    try {
      const res = await authedFetch(`/api/v1/expenses/${exp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!res.ok) throw new Error("bad status");
      setJustLearnedId(exp.id);
      setTimeout(() => setJustLearnedId(id => (id === exp.id ? null : id)), 2600);
    } catch {
      setExpenses(list => list.map(x => (x.id === exp.id ? { ...x, category: prev } : x)));
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/v1/expenses?business_id=${businessId}&limit=100`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setExpenses((data.expenses ?? []) as Expense[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load expenses.");
    } finally {
      setLoading(false);
    }
  }, [businessId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(expenses.map(e => e.category).filter(Boolean) as string[]))],
    [expenses]
  );

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      const catOk = activeCat === "All" || e.category === activeCat;
      const q = query.trim().toLowerCase();
      const qOk = !q || (e.vendor_name ?? "").toLowerCase().includes(q) || (e.category ?? "").toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [expenses, activeCat, query]);

  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0);
  const totalGst = filtered.reduce((s, e) => s + (e.gst_amount || 0), 0);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)" }}>Expenses</h1>
          <p style={{ color: "var(--color-text-dim)", marginTop: "4px" }}>
            Every booked expense, auto-categorized by the Accounting agent.
          </p>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={15} color="var(--color-text-dim)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search vendor or category…"
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
            <AlertTriangle size={18} color="var(--color-danger)" />
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
          { label: "Total (filtered)", value: total, prefix: "₹", icon: ReceiptText, color: "#b8862e" },
          { label: "GST recoverable", value: totalGst, prefix: "₹", icon: Tag, color: "var(--color-success)" },
          { label: "Expenses shown", value: filtered.length, prefix: "", icon: AlertTriangle, color: "var(--color-cyan)" },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <StaggerItem key={t.label}>
              <div className="glass-card lift" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${t.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={18} color={t.color} />
                </div>
                <div>
                  <div className="tabular" style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--color-text)", letterSpacing: "-0.02em" }}>
                    <AnimatedNumber value={t.value} prefix={t.prefix} />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{t.label}</div>
                </div>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>

      {/* Category filter chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {categories.map((c) => {
          const active = c === activeCat;
          return (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              style={{
                padding: "7px 14px", borderRadius: 999, fontSize: "0.8rem", fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s ease",
                border: `1px solid ${active ? "rgba(184,134,46,0.5)" : "var(--color-stroke)"}`,
                background: active ? "rgba(184,134,46,0.14)" : "transparent",
                color: active ? "#9c6b1f" : "var(--color-text-muted)",
              }}>
              {c}
            </button>
          );
        })}
      </div>

      {/* Expense list */}
      <div className="glass-card" style={{ padding: "8px 8px 12px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-stroke)" }}>
              {["Vendor", "Category", "Date", "GST", "Amount"].map((h, i) => (
                <th key={h} style={{ textAlign: i > 2 ? "right" : "left", padding: "12px 16px", fontSize: "0.72rem", color: "var(--color-text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout" initial={false}>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--color-text-dim)" }}>Loading expenses…</td></tr>
              ) : error ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--color-text-dim)" }}>Couldn&apos;t load expenses.</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: "48px 24px", textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(184,134,46,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ReceiptText size={24} color="var(--color-primary-glow)" />
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)" }}>No expenses yet</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--color-text-dim)", maxWidth: 380 }}>Upload a receipt and the agents will extract and categorize it automatically.</div>
                    <a href="/dashboard/receipts" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 4, padding: "9px 18px" }}>
                      <Upload size={15} /> Upload a receipt
                    </a>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--color-text-dim)" }}>No expenses match this filter.</td></tr>
              ) : (
                filtered.map((e, i) => (
                  <motion.tr
                    key={e.id}
                    layout
                    className="data-row"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                    style={{ borderBottom: "1px solid var(--color-stroke)" }}>
                    <td style={{ padding: "13px 16px", fontSize: "0.875rem", color: "var(--color-text)", fontWeight: 500 }}>
                      {e.vendor_name ?? "Unknown"}
                      {e.is_duplicate && (
                        <span style={{ marginLeft: 8, fontSize: "0.66rem", fontWeight: 700, color: "var(--color-warning)", background: "rgba(245,158,11,0.14)", padding: "2px 7px", borderRadius: 999, textTransform: "uppercase" }}>
                          dup
                        </span>
                      )}
                      {e.fraud_risk && FRAUD_BADGE[e.fraud_risk] && (
                        <span
                          title={e.metadata?.fraud_reasons?.join(" · ") ?? undefined}
                          style={{
                            marginLeft: 8, fontSize: "0.66rem", fontWeight: 700,
                            color: FRAUD_BADGE[e.fraud_risk].color,
                            background: `${FRAUD_BADGE[e.fraud_risk].color}20`,
                            padding: "2px 7px", borderRadius: 999, textTransform: "uppercase",
                          }}>
                          {FRAUD_BADGE[e.fraud_risk].label}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: "0.82rem" }}>
                      {editingId === e.id ? (
                        <select
                          autoFocus
                          defaultValue={e.category ?? "Other"}
                          onBlur={() => setEditingId(null)}
                          onChange={ev => saveCategory(e, ev.target.value)}
                          style={{
                            background: "var(--color-surface)", border: "1px solid rgba(184,134,46,0.5)",
                            borderRadius: 8, padding: "5px 8px", color: "var(--color-text)",
                            fontSize: "0.8rem", outline: "none",
                          }}>
                          {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingId(e.id)}
                          title="Click to correct — the app learns from this"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 7, color: "var(--color-text)",
                            background: "transparent", border: "none", padding: 0,
                            cursor: "pointer", fontSize: "0.82rem",
                            borderBottom: "1px dashed rgba(36,28,21,0.18)",
                          }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorFor(e.category) }} />
                          {e.category ?? "Uncategorized"}
                          {justLearnedId === e.id && (
                            <span style={{ marginLeft: 6, fontSize: "0.68rem", color: "var(--color-primary-glow)" }}>✨ learned</span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="tabular" style={{ padding: "13px 16px", fontSize: "0.8rem", color: "var(--color-text-dim)" }}>{e.expense_date}</td>
                    <td className="tabular" style={{ padding: "13px 16px", fontSize: "0.82rem", color: "var(--color-success)", textAlign: "right" }}>
                      {e.gst_amount ? `₹${e.gst_amount.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="tabular" style={{ padding: "13px 16px", fontSize: "0.9rem", color: "var(--color-text)", fontWeight: 600, textAlign: "right", letterSpacing: "-0.01em" }}>
                      ₹{e.amount.toLocaleString("en-IN")}
                    </td>
                  </motion.tr>
                ))
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
}
