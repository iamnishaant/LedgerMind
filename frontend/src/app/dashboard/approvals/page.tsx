"use client";
/**
 * Approvals — Phase 10 (Enterprise: Approvals workflow).
 * Expenses the Fraud agent scored 'high' risk land here awaiting an owner's
 * sign-off. Owner-only decision (approve/reject); members can see the queue
 * but the buttons are hidden — the backend enforces the same rule
 * independently either way.
 */
import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Check, X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

interface Expense {
  id: string;
  vendor_name: string | null;
  category: string | null;
  amount: number;
  expense_date: string;
  metadata?: { fraud_reasons?: string[] } | null;
}

export default function ApprovalsPage() {
  const { businessId, userId, authedFetch } = useBusiness();
  const [pending, setPending] = useState<Expense[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [approvalsRes, teamRes] = await Promise.all([
        authedFetch(`/api/v1/approvals?business_id=${businessId}`),
        authedFetch(`/api/v1/team?business_id=${businessId}`),
      ]);
      if (!approvalsRes.ok) throw new Error((await approvalsRes.json().catch(() => ({}))).detail ?? "Couldn't load approvals");
      const data = await approvalsRes.json();
      setPending(data.pending ?? []);
      if (teamRes.ok) {
        const team = await teamRes.json();
        setIsOwner(team.members?.some((m: any) => m.user_id === userId && m.role === "owner") ?? false);
      }
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message ?? "Backend unreachable — is it running?" });
    } finally {
      setLoading(false);
    }
  }, [businessId, userId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const approve = async (expenseId: string) => {
    setBusy(expenseId);
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/approvals/${expenseId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Couldn't approve");
      setPending((p) => p.filter((e) => e.id !== expenseId));
      setNotice({ kind: "ok", text: "Expense approved." });
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const reject = async (expenseId: string) => {
    setBusy(expenseId);
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/approvals/${expenseId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "rejected", reason: reason.trim() || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Couldn't reject");
      setPending((p) => p.filter((e) => e.id !== expenseId));
      setNotice({ kind: "ok", text: "Expense rejected." });
      setRejecting(null);
      setReason("");
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
          <ShieldAlert size={24} color="#f59e0b" /> Approvals
        </h1>
        <p style={{ color: "#64748b", marginTop: 4 }}>
          Expenses the Fraud agent flagged as high risk, awaiting {isOwner ? "your" : "the owner's"} sign-off.
        </p>
      </Reveal>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              marginBottom: 16, padding: "10px 14px", borderRadius: 10, fontSize: "0.85rem",
              color: notice.kind === "ok" ? "#10b981" : "#f87171",
              background: notice.kind === "ok" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${notice.kind === "ok" ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
            }}>
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ color: "#64748b", padding: 40, textAlign: "center" }}>Loading approvals…</div>
      ) : pending.length === 0 ? (
        <div className="glass-card" style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
          Nothing awaiting approval right now.
        </div>
      ) : (
        <Stagger style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pending.map((e) => (
            <StaggerItem key={e.id}>
              <div className="glass-card" style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#f1f5f9" }}>
                      {e.vendor_name ?? "Unknown vendor"}
                      <span style={{ marginLeft: 8, fontSize: "0.75rem", fontWeight: 400, color: "#64748b" }}>
                        {e.category ?? "Uncategorized"} · {e.expense_date}
                      </span>
                    </div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f1f5f9", marginTop: 4 }}>
                      ₹{e.amount.toLocaleString("en-IN")}
                    </div>
                  </div>
                  {isOwner && rejecting !== e.id && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-primary" disabled={busy !== null} onClick={() => approve(e.id)}
                        style={{ display: "flex", alignItems: "center", gap: 6, opacity: busy === e.id ? 0.6 : 1 }}>
                        <Check size={14} /> Approve
                      </button>
                      <button className="btn-ghost" disabled={busy !== null} onClick={() => setRejecting(e.id)}
                        style={{ display: "flex", alignItems: "center", gap: 6, color: "#f87171" }}>
                        <X size={14} /> Reject
                      </button>
                    </div>
                  )}
                </div>

                {e.metadata?.fraud_reasons && e.metadata.fraud_reasons.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                    {e.metadata.fraud_reasons.map((r, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "0.78rem", color: "#fbbf24" }}>
                        <AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0 }} /> {r}
                      </div>
                    ))}
                  </div>
                )}

                {rejecting === e.id && (
                  <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={reason}
                      onChange={(ev) => setReason(ev.target.value)}
                      placeholder="Reason (optional)"
                      style={{
                        flex: 1, background: "rgba(26,34,53,0.6)", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 8, padding: "8px 12px", color: "#f1f5f9", fontSize: "0.82rem", outline: "none",
                      }}
                    />
                    <button className="btn-primary" disabled={busy !== null} onClick={() => reject(e.id)}
                      style={{ background: "#f87171", opacity: busy === e.id ? 0.6 : 1 }}>
                      Confirm reject
                    </button>
                    <button className="btn-ghost" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</button>
                  </div>
                )}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
