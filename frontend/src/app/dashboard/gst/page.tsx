"use client";
/**
 * GST Intelligence — Phase 3.
 * Renders /api/v1/gst/summary: ITC recoverable vs. blocked, breakdown by rate
 * slab, and expenses missing a GSTIN (needed to actually claim ITC).
 */
import { useCallback, useEffect, useState } from "react";
import { ReceiptText, ShieldCheck, ShieldOff, AlertTriangle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

interface GstSummary {
  month: string;
  itc_recoverable: number;
  itc_blocked: number;
  total_gst: number;
  by_rate: Record<string, number>;
  missing_gstin: { id: string; vendor_name: string | null; amount: number; gst_amount: number; expense_date: string }[];
  missing_gstin_count: number;
}

export default function GstPage() {
  const { businessId, authedFetch } = useBusiness();
  const [data, setData] = useState<GstSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await authedFetch(`/api/v1/gst/summary?business_id=${businessId}`);
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't compute the GST summary.");
    } finally {
      setLoading(false);
    }
  }, [businessId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const rateEntries = data ? Object.entries(data.by_rate) : [];
  const maxRateAmount = rateEntries.length ? Math.max(...rateEntries.map(([, v]) => v)) : 0;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 10 }}>
          <ReceiptText size={24} color="var(--color-primary-glow)" /> GST Intelligence
        </h1>
        <p style={{ color: "var(--color-text-dim)", marginTop: 4 }}>
          Input Tax Credit recoverable this month, and what's blocking the rest.
        </p>
      </Reveal>

      {loading ? (
        <div style={{ color: "var(--color-text-dim)", padding: 40, textAlign: "center" }}>Computing GST summary…</div>
      ) : error ? (
        <div className="glass-card" style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>{error} — is the backend running?</p>
          <button onClick={load} className="btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : !data || data.total_gst === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: "center", color: "var(--color-text-dim)" }}>
          No GST captured on expenses yet. It'll show up here once receipts with GST are processed.
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 22 }}>
            <StaggerItem>
              <div className="glass-card lift" style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(47,143,82,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ShieldCheck size={18} color="var(--color-success)" />
                </div>
                <div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--color-text)" }}>
                    <AnimatedNumber value={data.itc_recoverable} prefix="₹" />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-dim)" }}>ITC recoverable</div>
                </div>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="glass-card lift" style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(178,58,46,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ShieldOff size={18} color="var(--color-danger)" />
                </div>
                <div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--color-text)" }}>
                    <AnimatedNumber value={data.itc_blocked} prefix="₹" />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-dim)" }}>Blocked / ineligible</div>
                </div>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="glass-card lift" style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(185,121,28,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <AlertTriangle size={18} color="var(--color-warning)" />
                </div>
                <div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--color-text)" }}>
                    <AnimatedNumber value={data.missing_gstin_count} format={false} />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-dim)" }}>Missing GSTIN</div>
                </div>
              </div>
            </StaggerItem>
          </Stagger>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* By rate slab */}
            <Reveal className="glass-card" style={{ padding: 24 }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)", marginBottom: 18 }}>GST by rate slab</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {rateEntries.map(([rate, amount]) => (
                  <div key={rate}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: 5 }}>
                      <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{rate}</span>
                      <span style={{ color: "var(--color-text-dim)" }}>₹{amount.toLocaleString("en-IN")}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--color-stroke)", overflow: "hidden" }}>
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${maxRateAmount ? (amount / maxRateAmount) * 100 : 0}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #b8862e, #a8541f)" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Missing GSTIN follow-up list */}
            <Reveal delay={0.08} className="glass-card" style={{ padding: 24 }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)", marginBottom: 6 }}>Needs a GSTIN</h2>
              <p style={{ fontSize: "0.78rem", color: "var(--color-text-dim)", marginBottom: 14 }}>
                A valid tax invoice with the supplier's GSTIN is required to claim ITC.
              </p>
              {data.missing_gstin.length === 0 ? (
                <p style={{ color: "var(--color-success)", fontSize: "0.85rem" }}>Every GST expense has a GSTIN on file. ✓</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                  <AnimatePresence initial={false}>
                    {data.missing_gstin.map((e) => (
                      <motion.div key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderRadius: 8, background: "rgba(185,121,28,0.06)", border: "1px solid rgba(185,121,28,0.16)" }}>
                        <div>
                          <div style={{ fontSize: "0.83rem", color: "var(--color-text)", fontWeight: 500 }}>{e.vendor_name ?? "Unknown"}</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--color-text-dim)" }}>{e.expense_date}</div>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--color-warning)", fontWeight: 600 }}>₹{e.gst_amount.toLocaleString("en-IN")}</div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </Reveal>
          </div>
        </>
      )}
    </div>
  );
}
