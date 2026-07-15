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
}

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
  "Software & Subscriptions": "#6366f1",
  "Travel & Transport": "#22d3ee",
  "Office Supplies": "#10b981",
  "Marketing & Advertising": "#f59e0b",
  "Food & Dining": "#ec4899",
  "Utilities": "#8b5cf6",
};
const colorFor = (c: string | null) => CATEGORY_COLOR[c ?? ""] ?? "#64748b";

export default function ExpensesPage() {
  const { businessId, authedFetch } = useBusiness();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingSample, setUsingSample] = useState(false);
  const [activeCat, setActiveCat] = useState<string>("All");
  const [query, setQuery] = useState("");

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
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f1f5f9" }}>Expenses</h1>
          <p style={{ color: "#64748b", marginTop: "4px" }}>
            Every booked expense, auto-categorized by the Accounting agent.
            {usingSample && <span style={{ color: "#f59e0b" }}> · showing sample data (backend offline)</span>}
          </p>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={15} color="#64748b" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search vendor or category…"
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
          { label: "Total (filtered)", value: total, prefix: "₹", icon: ReceiptText, color: "#6366f1" },
          { label: "GST recoverable", value: totalGst, prefix: "₹", icon: Tag, color: "#10b981" },
          { label: "Expenses shown", value: filtered.length, prefix: "", icon: AlertTriangle, color: "#22d3ee" },
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
                    <AnimatedNumber value={t.value} prefix={t.prefix} />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{t.label}</div>
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
                border: `1px solid ${active ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
                background: active ? "rgba(99,102,241,0.16)" : "transparent",
                color: active ? "#818cf8" : "#94a3b8",
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
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Vendor", "Category", "Date", "GST", "Amount"].map((h, i) => (
                <th key={h} style={{ textAlign: i > 2 ? "right" : "left", padding: "12px 16px", fontSize: "0.72rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout" initial={false}>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading expenses…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#64748b" }}>No expenses match this filter.</td></tr>
              ) : (
                filtered.map((e, i) => (
                  <motion.tr
                    key={e.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"}
                    onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.background = "transparent"}>
                    <td style={{ padding: "13px 16px", fontSize: "0.875rem", color: "#f1f5f9", fontWeight: 500 }}>
                      {e.vendor_name ?? "Unknown"}
                      {e.is_duplicate && (
                        <span style={{ marginLeft: 8, fontSize: "0.66rem", fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.14)", padding: "2px 7px", borderRadius: 999, textTransform: "uppercase" }}>
                          dup
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: "0.82rem" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "#cbd5e1" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorFor(e.category) }} />
                        {e.category ?? "Uncategorized"}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: "0.82rem", color: "#64748b" }}>{e.expense_date}</td>
                    <td style={{ padding: "13px 16px", fontSize: "0.82rem", color: "#10b981", textAlign: "right" }}>
                      {e.gst_amount ? `₹${e.gst_amount.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: "0.9rem", color: "#f1f5f9", fontWeight: 600, textAlign: "right" }}>
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
