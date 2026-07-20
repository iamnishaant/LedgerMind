"use client";
/**
 * Forecasts — Phase 6.
 * Renders the deterministic spend forecast from /api/v1/forecasts:
 * monthly history + projected next months, average burn, trend.
 */
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Flame, CalendarClock, LineChart as LineIcon } from "lucide-react";
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
  rising: { color: "#ef4444", label: "Rising", icon: TrendingUp },
  falling: { color: "#10b981", label: "Falling", icon: TrendingDown },
  stable: { color: "#818cf8", label: "Stable", icon: Minus },
} as const;

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload.find((x: any) => x.value != null);
  if (!p) return null;
  return (
    <div style={{ background: "#1a2235", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 14px" }}>
      <p style={{ color: "#94a3b8", fontSize: "0.72rem" }}>{label}</p>
      <p style={{ color: "#f1f5f9", fontWeight: 700 }}>
        {p.dataKey === "projected" ? "Projected " : ""}₹{Number(p.value).toLocaleString("en-IN")}
      </p>
    </div>
  );
};

export default function ForecastsPage() {
  const { businessId, authedFetch } = useBusiness();
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await authedFetch(`/api/v1/forecasts?business_id=${businessId}&horizon=3`);
        if (!r.ok) throw new Error();
        setData(await r.json());
      } catch { setOffline(true); }
      finally { setLoading(false); }
    })();
  }, [businessId, authedFetch]);

  const chart = data ? buildForecastChartData(data.history, data.forecast) : [];

  const trend = data ? TREND[data.trend] : TREND.stable;
  const TrendIcon = trend.icon;

  const tiles = data ? [
    { label: "Avg monthly burn", value: data.avg_monthly, prefix: "₹", icon: Flame, color: "#f59e0b" },
    { label: "This month (run-rate)", value: data.current_month_run_rate, prefix: "₹", icon: CalendarClock, color: "#22d3ee" },
    { label: "Next month (projected)", value: data.next_month_projection, prefix: "₹", icon: LineIcon, color: "#6366f1" },
  ] : [];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
          <TrendingUp size={24} color="#818cf8" /> Forecasts
        </h1>
        <p style={{ color: "#64748b", marginTop: 4 }}>
          Projected spend from your history (linear trend over complete months).
          {offline && <span style={{ color: "#f59e0b" }}> · backend offline</span>}
        </p>
      </Reveal>

      {loading ? (
        <div style={{ color: "#64748b", padding: 40, textAlign: "center" }}>Computing forecast…</div>
      ) : !data || data.history.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
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
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9" }}>
                        <AnimatedNumber value={t.value} prefix={t.prefix} />
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{t.label}</div>
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
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Spend trend</div>
                </div>
              </div>
            </StaggerItem>
          </Stagger>

          {/* Chart */}
          <Reveal className="glass-card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#f1f5f9" }}>Monthly spend & projection</h2>
              <div style={{ display: "flex", gap: 16, fontSize: "0.75rem" }}>
                <Legend color="#6366f1" label="Actual" />
                <Legend color="#22d3ee" label="Projected" dashed />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={48} />
                <Tooltip content={<ChartTooltip />} />
                {data.history.length > 0 && (
                  <ReferenceLine x={monthLabel(data.history[data.history.length - 1].month)} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                )}
                <Line type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: "#6366f1" }} connectNulls={false} />
                <Line type="monotone" dataKey="projected" stroke="#22d3ee" strokeWidth={2.5} strokeDasharray="6 5" dot={{ r: 3, fill: "#22d3ee" }} connectNulls />
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#94a3b8" }}>
      <span style={{ width: 16, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }} />
      {label}
    </span>
  );
}
