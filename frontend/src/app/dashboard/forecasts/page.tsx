"use client";
/**
 * Forecasts — Phase 6.
 * Renders the deterministic spend forecast from /api/v1/forecasts:
 * monthly history + projected next months, average burn, trend.
 */
import { useCallback, useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Flame, CalendarClock, LineChart as LineIcon, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";
import { monthLabel, buildForecastChartData } from "@/lib/forecast-chart";

interface Forecast {
  history: { month: string; total: number; partial: boolean }[];
  forecast: { month: string; projected: number }[];
  avg_monthly: number;
  trend: "rising" | "falling" | "stable";
  next_month_projection: number;
  current_month_run_rate: number;
}

const TREND = {
  rising: { color: "var(--color-danger)", label: "Rising", icon: TrendingUp },
  falling: { color: "var(--color-success)", label: "Falling", icon: TrendingDown },
  stable: { color: "var(--color-primary-glow)", label: "Stable", icon: Minus },
} as const;

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload.find((x: any) => x.value != null);
  if (!p) return null;
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-stroke)", borderRadius: 10, padding: "8px 14px", boxShadow: "0 4px 16px -4px rgba(120,90,50,0.18)" }}>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.72rem" }}>{label}</p>
      <p style={{ color: "var(--color-text)", fontWeight: 700 }}>
        {p.dataKey === "projected" ? "Projected " : ""}₹{Number(p.value).toLocaleString("en-IN")}
      </p>
    </div>
  );
};

export default function ForecastsPage() {
  const { businessId, authedFetch } = useBusiness();
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await authedFetch(`/api/v1/forecasts?business_id=${businessId}&horizon=3`);
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't compute the forecast.");
    } finally {
      setLoading(false);
    }
  }, [businessId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const chart = data ? buildForecastChartData(data.history, data.forecast) : [];

  const trend = data ? TREND[data.trend] : TREND.stable;
  const TrendIcon = trend.icon;

  const tiles = data ? [
    { label: "Avg monthly burn", value: data.avg_monthly, prefix: "₹", icon: Flame, color: "var(--color-warning)" },
    { label: "This month (run-rate)", value: data.current_month_run_rate, prefix: "₹", icon: CalendarClock, color: "var(--color-primary-strong)" },
    { label: "Next month (projected)", value: data.next_month_projection, prefix: "₹", icon: LineIcon, color: "#b8862e" },
  ] : [];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 10 }}>
          <TrendingUp size={24} color="var(--color-primary-glow)" /> Forecasts
        </h1>
        <p style={{ color: "var(--color-text-dim)", marginTop: 4 }}>
          Projected spend from your history (linear trend over complete months).
        </p>
      </Reveal>

      {loading ? (
        <div style={{ color: "var(--color-text-dim)", padding: 40, textAlign: "center" }}>Computing forecast…</div>
      ) : error ? (
        <div className="glass-card" style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>{error} — is the backend running?</p>
          <button onClick={load} className="btn-ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      ) : !data || data.history.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: "center", color: "var(--color-text-dim)" }}>
          Not enough expense history yet to forecast. Upload receipts or seed data first.
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, marginBottom: 20 }}>
            {tiles.map(t => {
              const Icon = t.icon;
              return (
                <StaggerItem key={t.label}>
                  <div className="glass-card lift" style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${t.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={18} color={t.color} />
                    </div>
                    <div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--color-text)" }}>
                        <AnimatedNumber value={t.value} prefix={t.prefix} />
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-dim)" }}>{t.label}</div>
                    </div>
                  </div>
                </StaggerItem>
              );
            })}
            <StaggerItem>
              <div className="glass-card lift" style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${trend.color}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <TrendIcon size={18} color={trend.color} />
                </div>
                <div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700, color: trend.color }}>{trend.label}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-dim)" }}>Spend trend</div>
                </div>
              </div>
            </StaggerItem>
          </Stagger>

          {/* Chart */}
          <Reveal className="glass-card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)" }}>Monthly spend & projection</h2>
              <div style={{ display: "flex", gap: 16, fontSize: "0.75rem" }}>
                <Legend color="#b8862e" label="Actual" />
                <Legend color="var(--color-primary-strong)" label="Projected" dashed />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-stroke)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "var(--color-text-dim)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--color-text-dim)", fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={48} />
                <Tooltip content={<ChartTooltip />} />
                {data.history.length > 0 && (
                  <ReferenceLine x={monthLabel(data.history[data.history.length - 1].month)} stroke="rgba(36,28,21,0.16)" strokeDasharray="4 4" />
                )}
                <Line type="monotone" dataKey="actual" stroke="#b8862e" strokeWidth={2.5} dot={{ r: 3, fill: "#b8862e" }} connectNulls={false} />
                <Line type="monotone" dataKey="projected" stroke="var(--color-primary-strong)" strokeWidth={2.5} strokeDasharray="6 5" dot={{ r: 3, fill: "var(--color-primary-strong)" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Reveal>
        </>
      )}
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-muted)" }}>
      <span style={{ width: 16, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }} />
      {label}
    </span>
  );
}
