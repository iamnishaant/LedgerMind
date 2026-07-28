"use client";
/**
 * Dashboard — the signed-in user's real financial overview.
 *
 * Every figure here comes from GET /api/v1/dashboard/summary for the user's
 * active business (one authenticated round-trip). There is NO mock data: while
 * the request is in flight we show skeletons; a business with no expenses yet
 * shows a proper empty state; a failed request shows an error with a Retry
 * button. Multi-tenant safe — the backend scopes every query to the caller's
 * business via ensure_owns_business().
 */
import { useCallback, useEffect, useState } from "react";
import {
  Receipt, AlertCircle, IndianRupee, CheckCircle2, RefreshCw, Upload, Sparkles,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { motion, Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

// ── API response shape (see backend/app/api/v1/dashboard.py) ──
interface DashboardSummary {
  month: string;
  kpis: { total_spend: number; receipt_count: number; gst_recoverable: number; needs_review: number };
  by_category: { category: string; amount: number }[];
  recent_expenses: { id: string; vendor_name: string | null; amount: number; category: string | null; expense_date: string }[];
  agent_activity: { needs_review: number; expenses_categorized: number; gst_recoverable: number; missing_gstin: number };
}

const CATEGORY_COLORS = ["#b8862e", "#a8541f", "#4f7268", "#b9791c", "#8a4a6b", "#2f8f52", "#7a6a54", "#9c6b1f"];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { category: string }; value: number }[] }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-popover border text-popover-foreground rounded-lg p-3 shadow-md">
        <p className="text-muted-foreground text-xs">{payload[0].payload.category}</p>
        <p className="font-bold tabular">{inr(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

export default function DashboardPage() {
  const { fullName, businessId, authedFetch } = useBusiness();
  const firstName = (fullName || "there").split(" ")[0].split("@")[0];

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // null = current month (server decides). Set when the user jumps to the month
  // their data actually lives in.
  const [month, setMonth] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = `business_id=${businessId}${month ? `&month=${month}` : ""}`;
      const r = await authedFetch(`/api/v1/dashboard/summary?${q}`);
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      setData((await r.json()) as DashboardSummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, [businessId, authedFetch, month]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-[1200px] mx-auto space-y-8 pb-10">
      {/* Header */}
      <Reveal y={12}>
        <h1 className="serif text-3xl text-foreground" style={{ fontWeight: 500 }}>
          {greeting()}, {firstName} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {data
            ? <>Here&apos;s your financial overview for <span className="text-primary font-medium">{monthLabel(data.month)}</span></>
            : "Loading your financial overview…"}
        </p>
      </Reveal>

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && loading && <DashboardSkeleton />}

      {!error && !loading && data && (
        data.kpis.receipt_count === 0 && data.recent_expenses.length === 0
          ? <EmptyState />
          : <>
              <OtherMonthNotice data={data} onJump={setMonth} />
              <DashboardContent data={data} />
            </>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * Explains a legitimately-empty month.
 *
 * KPIs are scoped to the selected month, but "Recent Expenses" is all-time. A
 * receipt dated in an earlier month therefore shows ₹0 up top while rows are
 * visible below — correct, but it reads as a broken dashboard. Name the reason
 * and offer one click to the month that actually holds the data.
 */
function OtherMonthNotice({ data, onJump }: {
  data: DashboardSummary;
  onJump: (month: string) => void;
}) {
  if (data.kpis.receipt_count > 0 || data.recent_expenses.length === 0) return null;

  const latest = data.recent_expenses[0];
  const iso = latest?.expense_date;
  if (!iso) return null;
  const target = iso.slice(0, 7);              // YYYY-MM
  if (target === data.month) return null;      // same month — nothing to explain

  return (
    <Reveal y={10}>
      <div className="glass-card flex flex-wrap items-center gap-3 px-5 py-4">
        <AlertCircle size={18} className="text-primary shrink-0" />
        <p className="text-sm text-muted-foreground flex-1 min-w-[220px]">
          No expenses recorded in <span className="text-foreground font-medium">{monthLabel(data.month)}</span>.
          Your most recent activity was <span className="text-foreground font-medium">{dayLabel(iso)}</span>.
        </p>
        <button onClick={() => onJump(target)} className="btn-ghost text-sm font-semibold">
          View {monthLabel(target)}
        </button>
      </div>
    </Reveal>
  );
}

// ── Real content ──────────────────────────────────────────────
function DashboardContent({ data }: { data: DashboardSummary }) {
  const { kpis, agent_activity } = data;
  const kpiTiles = [
    { label: "Total Spend",         value: kpis.total_spend,     format: inr,     icon: IndianRupee,  accent: "#b8862e" },
    { label: "Expenses This Month", value: kpis.receipt_count,   format: String,  icon: Receipt,      accent: "#4f7268" },
    { label: "GST Recoverable",     value: kpis.gst_recoverable, format: inr,     icon: CheckCircle2, accent: "#2f8f52" },
    { label: "Needs Review",        value: kpis.needs_review,    format: String,  icon: AlertCircle,  accent: "#b9791c" },
  ];

  const chartData = data.by_category.slice(0, 6).map((c, i) => ({ ...c, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));

  const activity = [
    { agent: "OCR Agent",        status: agent_activity.needs_review > 0 ? `${agent_activity.needs_review} receipt${agent_activity.needs_review === 1 ? "" : "s"} need review` : "All receipts processed", warn: agent_activity.needs_review > 0, icon: agent_activity.needs_review > 0 ? "⚠️" : "✅" },
    { agent: "Accounting Agent", status: `${agent_activity.expenses_categorized} expense${agent_activity.expenses_categorized === 1 ? "" : "s"} categorized this month`, warn: false, icon: "✅" },
    { agent: "GST Agent",        status: agent_activity.gst_recoverable > 0 ? `${inr(agent_activity.gst_recoverable)} ITC recoverable` : "No recoverable ITC yet", warn: false, icon: "🔍" },
  ];

  return (
    <>
      {/* KPI grid */}
      <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiTiles.map((stat) => {
          const Icon = stat.icon;
          return (
            <StaggerItem key={stat.label}>
              <div
                className="group relative overflow-hidden rounded-xl p-5 transition-all duration-200 hover:-translate-y-1"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-stroke)", boxShadow: "var(--shadow-card)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${stat.accent}55`; e.currentTarget.style.boxShadow = `0 12px 30px -14px ${stat.accent}45`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-stroke)"; e.currentTarget.style.boxShadow = "var(--shadow-card)"; }}
              >
                <div style={{ position: "absolute", top: -30, right: -30, width: 90, height: 90, borderRadius: "50%", background: stat.accent, opacity: 0.1, filter: "blur(28px)", pointerEvents: "none" }} />
                <div className="relative flex justify-between items-start">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${stat.accent}1f`, border: `1px solid ${stat.accent}33` }}>
                    <Icon size={18} style={{ color: stat.accent }} />
                  </div>
                </div>
                <div className="relative mt-4">
                  <div className="tabular font-bold tracking-tight" style={{ fontSize: "1.7rem", color: "var(--color-text)", letterSpacing: "-0.03em" }}>
                    {stat.format === inr
                      ? <AnimatedNumber value={stat.value} prefix="₹" />
                      : <AnimatedNumber value={stat.value} />}
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--color-text-dim)" }}>{stat.label}</div>
                </div>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>

      {/* Charts + agent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Reveal className="bg-card text-card-foreground border rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-5">Spend by Category</h2>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground text-sm py-10 text-center">No categorized spend this month yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={30} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  {chartData.map((entry, i) => (
                    <linearGradient key={i} id={`bar-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={entry.color} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={entry.color} stopOpacity={0.35} />
                    </linearGradient>
                  ))}
                </defs>
                <XAxis dataKey="category" tick={{ fill: "var(--color-text-dim)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(184,134,46,0.08)" }} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={`url(#bar-${i})`} stroke={entry.color} strokeOpacity={0.4} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Reveal>

        <Reveal delay={0.1} className="bg-card text-card-foreground border rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Agent Activity</h2>
          <div className="flex flex-col gap-3">
            {activity.map(({ agent, status, warn, icon }) => (
              <div key={agent} className={`flex items-center gap-3 p-3 rounded-lg border ${warn ? "bg-destructive/10 border-destructive/20" : "bg-secondary border-border"}`}>
                <span className="text-lg">{icon}</span>
                <div>
                  <div className="text-sm font-semibold">{agent}</div>
                  <div className={`text-xs ${warn ? "text-destructive" : "text-primary"}`}>{status}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* Recent expenses */}
      <Reveal className="bg-card text-card-foreground border rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-semibold">Recent Expenses</h2>
          <a href="/dashboard/expenses" className="text-sm font-medium text-primary hover:underline">View all &rarr;</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                {["Vendor", "Amount", "Date", "Category"].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recent_expenses.map((r, i) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                  className="border-b border-border hover:bg-muted/50 transition-colors"
                >
                  <td className="p-3 text-sm font-medium">{r.vendor_name || "Unknown vendor"}</td>
                  <td className="p-3 text-sm tabular">{inr(r.amount)}</td>
                  <td className="p-3 text-sm text-muted-foreground tabular">{dayLabel(r.expense_date)}</td>
                  <td className="p-3">
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-secondary text-secondary-foreground">
                      {r.category || "Uncategorized"}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </>
  );
}

// ── Loading skeleton ──────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl p-5 h-[112px]" style={{ background: "#fff", border: "1px solid var(--color-stroke)" }}>
            <div className="w-10 h-10 rounded-lg bg-muted" />
            <div className="h-6 w-24 bg-muted rounded mt-6" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border rounded-xl p-6 h-[290px]"><div className="h-5 w-40 bg-muted rounded mb-6" /><div className="h-[200px] bg-muted/60 rounded" /></div>
        <div className="bg-card border rounded-xl p-6 h-[290px]"><div className="h-5 w-32 bg-muted rounded mb-6" /><div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-muted/60 rounded" />)}</div></div>
      </div>
      <div className="bg-card border rounded-xl p-6 h-[220px]"><div className="h-5 w-40 bg-muted rounded mb-6" /><div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-muted/60 rounded" />)}</div></div>
    </div>
  );
}

// ── Empty state (real business, no data yet) ──────────────────
function EmptyState() {
  return (
    <Reveal className="bg-card text-card-foreground border rounded-xl shadow-sm p-10 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "linear-gradient(135deg, #b8862e, #a8541f)", boxShadow: "0 8px 24px -6px rgba(184,134,46,0.45)" }}>
        <Sparkles size={30} color="#fff" />
      </div>
      <h2 className="serif text-2xl mb-2" style={{ fontWeight: 500 }}>No expenses yet</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        Upload your first receipt and the OCR &amp; accounting agents will extract the vendor, amount,
        GST and category automatically. Your dashboard fills in from there — no manual data entry.
      </p>
      <a href="/dashboard/receipts" className="btn-primary inline-flex items-center gap-2" style={{ padding: "11px 20px" }}>
        <Upload size={17} /> Upload a receipt
      </a>
    </Reveal>
  );
}

// ── Error state with retry ────────────────────────────────────
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <AlertCircle className="text-destructive" size={22} />
        <div>
          <div className="text-sm font-semibold text-destructive">Couldn&apos;t load your dashboard</div>
          <div className="text-xs text-muted-foreground mt-0.5">{message} — check that the backend is reachable and try again.</div>
        </div>
      </div>
      <button onClick={onRetry} className="btn-ghost inline-flex items-center gap-2" style={{ fontWeight: 600 }}>
        <RefreshCw size={15} /> Retry
      </button>
    </div>
  );
}
