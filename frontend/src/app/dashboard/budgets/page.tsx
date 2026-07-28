"use client";
/**
 * Budgets — Phase 5.
 * Lists budgets with live spend vs. limit and a run-rate overspend projection
 * (computed server-side in /api/v1/budgets). Create + delete budgets.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Target, AlertTriangle, CheckCircle2, TrendingUp, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

const CATEGORIES = [
  "Food & Dining", "Travel & Transport", "Office Supplies", "Software & Subscriptions",
  "Utilities", "Medical & Health", "Marketing & Advertising", "Rent & Facilities",
  "Professional Services", "Equipment",
];

interface Budget {
  id: string;
  name: string;
  category: string | null;
  amount: number;
  period_type: string;
  actual: number;
  remaining: number;
  pct_used: number;
  projected: number;
  state: "on_track" | "at_risk" | "over";
}

const STATE = {
  on_track: { color: "var(--color-success)", label: "On track", icon: CheckCircle2 },
  at_risk:  { color: "var(--color-warning)", label: "At risk",  icon: AlertTriangle },
  over:     { color: "var(--color-danger)", label: "Over",     icon: AlertTriangle },
} as const;

export default function BudgetsPage() {
  const { businessId, authedFetch } = useBusiness();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "Software & Subscriptions", amount: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await authedFetch(`/api/v1/budgets?business_id=${businessId}`);
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      const d = await r.json();
      setBudgets(d.budgets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load budgets.");
    } finally {
      setLoading(false);
    }
  }, [businessId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !Number(form.amount)) return;
    try {
      await authedFetch(`/api/v1/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId, name: form.name, category: form.category,
          amount: Number(form.amount), period_type: "monthly",
        }),
      });
      setForm({ name: "", category: "Software & Subscriptions", amount: "" });
      setShowForm(false);
      load();
    } catch { /* ignore */ }
  };

  const remove = async (id: string) => {
    setBudgets(prev => prev.filter(b => b.id !== id));
    try { await authedFetch(`/api/v1/budgets/${id}`, { method: "DELETE" }); } catch { /* ignore */ }
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 10 }}>
            <Target size={24} color="var(--color-primary-glow)" /> Budgets
          </h1>
          <p style={{ color: "var(--color-text-dim)", marginTop: 4 }}>
            Live spend vs. limit with run-rate overspend alerts.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(s => !s)} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Plus size={16} /> New budget
        </button>
      </Reveal>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", marginBottom: 20 }}>
            <div className="glass-card" style={{ padding: 20, display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr auto", gap: 12, alignItems: "end" }}>
              <Field label="Name">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Marketing Q3" style={inputStyle} />
              </Field>
              <Field label="Category">
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c} value={c} style={{ background: "var(--color-surface)" }}>{c}</option>)}
                </select>
              </Field>
              <Field label="Monthly limit (₹)">
                <input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="20000" style={inputStyle} />
              </Field>
              <button className="btn-primary" onClick={create} style={{ height: 42 }}>Add</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ color: "var(--color-text-dim)", padding: 40, textAlign: "center" }}>Loading budgets…</div>
      ) : error ? (
        <div className="glass-card" style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>{error} — is the backend running?</p>
          <button onClick={load} className="btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : budgets.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: "center", color: "var(--color-text-muted)" }}>
          No budgets yet. Click <strong style={{ color: "var(--color-primary-glow)" }}>New budget</strong> to create one.
        </div>
      ) : (
        <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {budgets.map(b => {
            const meta = STATE[b.state];
            const Icon = meta.icon;
            const barPct = Math.min(b.pct_used, 100);
            return (
              <StaggerItem key={b.id}>
                <div className="glass-card lift" style={{ padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 650, color: "var(--color-text)" }}>{b.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-dim)" }}>{b.category ?? "All categories"} · {b.period_type}</div>
                    </div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: meta.color, background: `${meta.color}18`, padding: "3px 9px", borderRadius: 999 }}>
                      <Icon size={11} /> {meta.label}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 6 }}>
                    <span style={{ color: "var(--color-text)", fontWeight: 600 }}>₹<AnimatedNumber value={b.actual} /></span>
                    <span style={{ color: "var(--color-text-dim)" }}>of ₹{b.amount.toLocaleString("en-IN")}</span>
                  </div>

                  {/* progress bar */}
                  <div style={{ height: 8, borderRadius: 999, background: "var(--color-stroke)", overflow: "hidden" }}>
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${barPct}%` }}
                      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                      style={{ height: "100%", borderRadius: 999, background: meta.color }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <TrendingUp size={12} color={meta.color} /> Projected ₹{b.projected.toLocaleString("en-IN")}
                    </span>
                    <button onClick={() => remove(b.id)} title="Delete"
                      style={{ background: "transparent", border: "none", color: "var(--color-text-dim)", cursor: "pointer", padding: 4, display: "flex" }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: "0.72rem", color: "var(--color-text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--color-surface)", border: "1px solid var(--color-stroke)",
  borderRadius: 10, padding: "10px 12px", color: "var(--color-text)", fontSize: "0.88rem",
  outline: "none", width: "100%", fontFamily: "inherit",
};
