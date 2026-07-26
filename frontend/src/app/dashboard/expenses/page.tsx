"use client";
/**
 * Expenses view — Phase 1.
 * Lists booked expenses with category filtering + a monthly summary.
 * Talks to the FastAPI backend (/api/v1/expenses) and falls back to
 * illustrative sample data when the backend isn't running.
 */
import { useEffect, useMemo, useState } from "react";
import { Search, Tag, AlertTriangle, ReceiptText } from "lucide-react";
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
  high: { label: "high risk", color: "#b23a2e" },
  medium: { label: "review", color: "#b9791c" },
};

// ── Illustrative fallback data (used when the API is unreachable) ──
const SAMPLE: Expense[] = [
  { id: "s1", vendor_name: "AWS India", category: "Software & Subscriptions", amount: 12400, currency: "INR", expense_date: "2026-07-12", gst_amount: 2232, is_duplicate: false },
  { id: "s2", vendor_name: "Zomato Business", category: "Food & Dining", amount: 3200, currency: "INR", expense_date: "2026-07-11", gst_amount: 160 },
  { id: "s3", vendor_name: "Ola Corporate", category: "Travel & Transport", amount: 850, currency: "INR", expense_date: "2026-07-11", gst_amount: 45 },
  { id: "s4", vendor_name: "Notion Labs", category: "Software & Subscriptions", amount: 2150, currency: "INR", expense_date: "2026-07-10", gst_amount: 387 },
  { id: "s5", vendor_name: "BSNL Broadband", category: "Utilities", amount: 1499, currency: "INR", expense_date: "2026-07-09", gst_amount: 269 },
  { id: "s6", vendor_name: "Staples", category: "Office Supplies", amount: 4680, currency: "INR", expense_date: "2026-07-08", gst_amount: 842 },
  { id: "s7", vendor_name: "Google Ads", category: "Marketing & Advertising", amount: 18500, currency: "INR", expense_date: "2026-07-06", gst_amount: 3330 },
  { id: "s8", vendor_name: "Ola Corporate", category: "Travel & Transport", amount: 850, currency: "INR", expense_date: "2026-07-11", gst_amount: 45, is_duplicate: true },
];

const CATEGORY_COLOR: Record<string, string> = {
  "Software & Subscriptions": "#b8862e",
  "Travel & Transport": "#4f7268",
  "Office Supplies": "#2f8f52",
  "Marketing & Advertising": "#b9791c",
  "Food & Dining": "#8a4a6b",
  "Utilities": "#6b4a8a",
};
const colorFor = (c: string | null) => CATEGORY_COLOR[c ?? ""] ?? "#8a7a64";

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
  const [usingSample, setUsingSample] = useState(false);
  const [activeCat, setActiveCat] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [justLearnedId, setJustLearnedId] = useState<string | null>(null);

  // Correct an expense's category. Optimistic update; records a learning signal
  // server-side (PATCH /expenses/{id}) so future receipts from this vendor
  // categorize the same way. Reverts on failure. Disabled on sample data.
  async function saveCategory(exp: Expense, category: string) {
    setEditingId(null);
    if (category === exp.category || usingSample) return;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch(`/api/v1/expenses?business_id=${businessId}&limit=100`);
        if (!res.ok) throw new Error("bad status");
        const data = await res.json();
        const rows: Expense[] = data.expenses ?? [];
        if (cancelled) return;
        if (rows.length === 0) { setExpenses(SAMPLE); setUsingSample(true); }
        else setExpenses(rows);
      } catch {
        if (!cancelled) { setExpenses(SAMPLE); setUsingSample(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, authedFetch]);

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
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#241c15" }}>Expenses</h1>
          <p style={{ color: "#8a7a64", marginTop: "4px" }}>
            Every booked expense, auto-categorized by the Accounting agent.
            {usingSample && <span style={{ color: "#b9791c" }}> · showing sample data (backend offline)</span>}
          </p>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={15} color="#8a7a64" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search vendor or category…"
            style={{
              background: "#ffffff", border: "1px solid rgba(36,28,21,0.09)",
              borderRadius: 10, padding: "9px 14px 9px 34px", color: "#241c15",
              fontSize: "0.85rem", outline: "none", width: 240,
            }}
          />
        </div>
      </Reveal>

      {/* Summary tiles */}
      <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "22px" }}>
        {[
          { label: "Total (filtered)", value: total, prefix: "₹", icon: ReceiptText, color: "#b8862e" },
          { label: "GST recoverable", value: totalGst, prefix: "₹", icon: Tag, color: "#2f8f52" },
          { label: "Expenses shown", value: filtered.length, prefix: "", icon: AlertTriangle, color: "#4f7268" },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <StaggerItem key={t.label}>
              <div className="glass-card lift" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${t.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={18} color={t.color} />
                </div>
                <div>
                  <div className="tabular" style={{ fontSize: "1.35rem", fontWeight: 700, color: "#241c15", letterSpacing: "-0.02em" }}>
                    <AnimatedNumber value={t.value} prefix={t.prefix} />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#6b5d49" }}>{t.label}</div>
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
                border: `1px solid ${active ? "rgba(184,134,46,0.5)" : "rgba(36,28,21,0.09)"}`,
                background: active ? "rgba(184,134,46,0.14)" : "transparent",
                color: active ? "#9c6b1f" : "#6b5d49",
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
            <tr style={{ borderBottom: "1px solid rgba(36,28,21,0.07)" }}>
              {["Vendor", "Category", "Date", "GST", "Amount"].map((h, i) => (
                <th key={h} style={{ textAlign: i > 2 ? "right" : "left", padding: "12px 16px", fontSize: "0.72rem", color: "#8a7a64", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout" initial={false}>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#8a7a64" }}>Loading expenses…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#8a7a64" }}>No expenses match this filter.</td></tr>
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
                    style={{ borderBottom: "1px solid rgba(36,28,21,0.05)" }}>
                    <td style={{ padding: "13px 16px", fontSize: "0.875rem", color: "#241c15", fontWeight: 500 }}>
                      {e.vendor_name ?? "Unknown"}
                      {e.is_duplicate && (
                        <span style={{ marginLeft: 8, fontSize: "0.66rem", fontWeight: 700, color: "#b9791c", background: "rgba(245,158,11,0.14)", padding: "2px 7px", borderRadius: 999, textTransform: "uppercase" }}>
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
                            background: "#ffffff", border: "1px solid rgba(184,134,46,0.5)",
                            borderRadius: 8, padding: "5px 8px", color: "#241c15",
                            fontSize: "0.8rem", outline: "none",
                          }}>
                          {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() => !usingSample && setEditingId(e.id)}
                          title={usingSample ? "Connect the backend to edit" : "Click to correct — the app learns from this"}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 7, color: "#4a3d2c",
                            background: "transparent", border: "none", padding: 0,
                            cursor: usingSample ? "default" : "pointer", fontSize: "0.82rem",
                            borderBottom: usingSample ? "none" : "1px dashed rgba(36,28,21,0.18)",
                          }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorFor(e.category) }} />
                          {e.category ?? "Uncategorized"}
                          {justLearnedId === e.id && (
                            <span style={{ marginLeft: 6, fontSize: "0.68rem", color: "#9c6b1f" }}>✨ learned</span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="tabular" style={{ padding: "13px 16px", fontSize: "0.8rem", color: "#8a7a64" }}>{e.expense_date}</td>
                    <td className="tabular" style={{ padding: "13px 16px", fontSize: "0.82rem", color: "#2f8f52", textAlign: "right" }}>
                      {e.gst_amount ? `₹${e.gst_amount.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="tabular" style={{ padding: "13px 16px", fontSize: "0.9rem", color: "#241c15", fontWeight: 600, textAlign: "right", letterSpacing: "-0.01em" }}>
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
