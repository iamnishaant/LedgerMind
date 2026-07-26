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
  rising: { color: "#b23a2e", label: "Rising", icon: TrendingUp },
  falling: { color: "#2f8f52", label: "Falling", icon: TrendingDown },
  stable: { color: "#9c6b1f", label: "Stable", icon: Minus },
} as const;

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload.find((x: any) => x.value != null);
  if (!p) return null;
  return (
    <div style={{ background: "#ffffff", border: "1px solid rgba(36,28,21,0.09)", borderRadius: 10, padding: "8px 14px", boxShadow: "0 4px 16px -4px rgba(120,90,50,0.18)" }}>
      <p style={{ color: "#6b5d49", fontSize: "0.72rem" }}>{label}</p>
      <p style={{ color: "#241c15", fontWeight: 700 }}>
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
    { label: "Avg monthly burn", value: data.avg_monthly, prefix: "₹", icon: Flame, color: "#b9791c" },
    { label: "This month (run-rate)", value: data.current_month_run_rate, prefix: "₹", icon: CalendarClock, color: "#a8541f" },
    { label: "Next month (projected)", value: data.next_month_projection, prefix: "₹", icon: LineIcon, color: "#b8862e" },
  ] : [];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#241c15", display: "flex", alignItems: "center", gap: 10 }}>
          <TrendingUp size={24} color="#9c6b1f" /> Forecasts
        </h1>
        <p style={{ color: "#8a7a64", marginTop: 4 }}>
          Projected spend from your history (linear trend over complete months).
          {offline && <span style={{ color: "#b9791c" }}> · backend offline</span>}
        </p>
      </Reveal>

      {loading ? (
        <div style={{ color: "#8a7a64", padding: 40, textAlign: "center" }}>Computing forecast…</div>
      ) : !data || data.history.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: "center", color: "#8a7a64" }}>
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
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#241c15" }}>
                        <AnimatedNumber value={t.value} prefix={t.prefix} />
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#8a7a64" }}>{t.label}</div>
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
                  <div style={{ fontSize: "0.75rem", color: "#8a7a64" }}>Spend trend</div>
                </div>
              </div>
            </StaggerItem>
          </Stagger>

          {/* Chart */}
          <Reveal className="glass-card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#241c15" }}>Monthly spend & projection</h2>
              <div style={{ display: "flex", gap: 16, fontSize: "0.75rem" }}>
                <Legend color="#b8862e" label="Actual" />
                <Legend color="#a8541f" label="Projected" dashed />
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(36,28,21,0.07)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#8a7a64", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#8a7a64", fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={48} />
                <Tooltip content={<ChartTooltip />} />
                {data.history.length > 0 && (
                  <ReferenceLine x={monthLabel(data.history[data.history.length - 1].month)} stroke="rgba(36,28,21,0.16)" strokeDasharray="4 4" />
                )}
                <Line type="monotone" dataKey="actual" stroke="#b8862e" strokeWidth={2.5} dot={{ r: 3, fill: "#b8862e" }} connectNulls={false} />
                <Line type="monotone" dataKey="projected" stroke="#a8541f" strokeWidth={2.5} strokeDasharray="6 5" dot={{ r: 3, fill: "#a8541f" }} connectNulls />
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#6b5d49" }}>
      <span style={{ width: 16, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }} />
      {label}
    </span>
  );
}
