"use client";
import { useState } from "react";
import { Receipt, AlertCircle, IndianRupee, CheckCircle2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { motion, Reveal, Stagger, StaggerItem, AnimatedNumber } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

// ── Mock data ──────────────────────────────────────────────
const summaryStats = [
  { label: "Total Spend",         num: 124820, prefix: "₹", suffix: "", change: "+8.2%", up: true,  icon: IndianRupee,  accent: "#6366f1" },
  { label: "Receipts This Month", num: 47,     prefix: "",  suffix: "", change: "+12",   up: true,  icon: Receipt,      accent: "#22d3ee" },
  { label: "GST Recoverable",     num: 18430,  prefix: "₹", suffix: "", change: "New",   up: true,  icon: CheckCircle2, accent: "#10b981" },
  { label: "Needs Review",        num: 3,      prefix: "",  suffix: "", change: "Action",up: false, icon: AlertCircle,  accent: "#f59e0b" },
];

const spendByCategory = [
  { category: "Software",       amount: 42000, color: "#6366f1" },
  { category: "Travel",         amount: 28500, color: "#22d3ee" },
  { category: "Office",         amount: 19200, color: "#10b981" },
  { category: "Marketing",      amount: 15800, color: "#f59e0b" },
  { category: "Food & Dining",  amount: 12100, color: "#ec4899" },
  { category: "Utilities",      amount: 7220,  color: "#8b5cf6" },
];

const recentReceipts = [
  { id: "1", vendor: "AWS India",       amount: 12400, status: "completed",    date: "12 Jul" },
  { id: "2", vendor: "Zomato Business", amount: 3200,  status: "needs_review", date: "11 Jul" },
  { id: "3", vendor: "Ola Corporate",   amount: 850,   status: "completed",    date: "11 Jul" },
  { id: "4", vendor: "Notion",          amount: 2150,  status: "processing",   date: "10 Jul" },
  { id: "5", vendor: "BSNL Broadband",  amount: 1499,  status: "completed",    date: "09 Jul" },
];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-popover border text-popover-foreground rounded-lg p-3 shadow-md">
        <p className="text-muted-foreground text-xs">{payload[0].payload.category}</p>
        <p className="font-bold tabular">₹{payload[0].value.toLocaleString("en-IN")}</p>
      </div>
    );
  }
  return null;
};

export default function DashboardPage() {
  const [activeMonth] = useState("July 2026");
  const { fullName } = useBusiness();
  const firstName = fullName.split(" ")[0].split("@")[0];

  return (
    <div className="max-w-[1200px] mx-auto space-y-8 pb-10">
      {/* Header */}
      <Reveal y={12}>
        <h1 className="text-3xl font-bold text-foreground">
          Good morning, {firstName} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's your financial overview for <span className="text-primary font-medium">{activeMonth}</span>
        </p>
      </Reveal>

      {/* Stats grid */}
      <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <StaggerItem key={stat.label}>
              <div
                className="group relative overflow-hidden rounded-xl p-5 transition-all duration-200 hover:-translate-y-1"
                style={{
                  background: "linear-gradient(180deg, rgba(30,41,59,0.5), rgba(15,23,42,0.5))",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 1px 2px rgba(2,6,23,0.4)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${stat.accent}66`; e.currentTarget.style.boxShadow = `0 12px 30px -14px ${stat.accent}80`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.boxShadow = "0 1px 2px rgba(2,6,23,0.4)"; }}
              >
                {/* subtle accent glow in the corner */}
                <div style={{ position: "absolute", top: -30, right: -30, width: 90, height: 90, borderRadius: "50%", background: stat.accent, opacity: 0.1, filter: "blur(28px)", pointerEvents: "none" }} />
                <div className="relative flex justify-between items-start">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: `${stat.accent}1f`, border: `1px solid ${stat.accent}33` }}>
                    <Icon size={18} style={{ color: stat.accent }} />
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      background: stat.up ? "rgba(16,185,129,0.13)" : "rgba(245,158,11,0.13)",
                      color: stat.up ? "#34d399" : "#fbbf24",
                      border: `1px solid ${stat.up ? "rgba(16,185,129,0.26)" : "rgba(245,158,11,0.26)"}`,
                    }}>
                    {stat.change}
                  </span>
                </div>
                <div className="relative mt-4">
                  <div className="tabular font-bold tracking-tight" style={{ fontSize: "1.7rem", color: "#f8fafc", letterSpacing: "-0.03em" }}>
                    <AnimatedNumber value={stat.num} prefix={stat.prefix} suffix={stat.suffix} />
                  </div>
                  <div className="text-xs mt-1" style={{ color: "#94a3b8" }}>{stat.label}</div>
                </div>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>

      {/* Charts + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spend by Category */}
        <Reveal className="bg-card text-card-foreground border rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-5">Spend by Category</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={spendByCategory} barSize={30} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                {spendByCategory.map((entry, i) => (
                  <linearGradient key={i} id={`bar-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={entry.color} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={entry.color} stopOpacity={0.35} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="category" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                {spendByCategory.map((entry, i) => (
                  <Cell key={i} fill={`url(#bar-${i})`} stroke={entry.color} strokeOpacity={0.4} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Reveal>

        {/* Needs Review Alert */}
        <Reveal delay={0.1} className="bg-card text-card-foreground border rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Agent Activity</h2>
          <div className="flex flex-col gap-3">
            {[
              { agent: "OCR Agent",        status: "3 receipts need review", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", icon: "⚠️" },
              { agent: "Accounting Agent", status: "47 expenses categorized", color: "text-primary", bg: "bg-secondary", border: "border-border", icon: "✅" },
              { agent: "GST Agent",        status: "₹18,430 ITC found",      color: "text-primary", bg: "bg-secondary", border: "border-border", icon: "🔍" },
            ].map(({ agent, status, color, bg, border, icon }) => (
              <div key={agent} className={`flex items-center gap-3 p-3 rounded-lg border ${bg} ${border}`}>
                <span className="text-lg">{icon}</span>
                <div>
                  <div className="text-sm font-semibold">{agent}</div>
                  <div className={`text-xs ${color}`}>{status}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* Recent Receipts */}
      <Reveal className="bg-card text-card-foreground border rounded-xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-semibold">Recent Receipts</h2>
          <a href="/dashboard/receipts" className="text-sm font-medium text-primary hover:underline">
            View all &rarr;
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                {["Vendor", "Amount", "Date", "Status"].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentReceipts.map((r, i) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                  className="border-b border-border hover:bg-muted/50 transition-colors"
                >
                  <td className="p-3 text-sm font-medium">{r.vendor}</td>
                  <td className="p-3 text-sm tabular">₹{r.amount.toLocaleString("en-IN")}</td>
                  <td className="p-3 text-sm text-muted-foreground tabular">{r.date}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      r.status === 'completed' ? 'bg-primary text-primary-foreground' : 
                      r.status === 'needs_review' ? 'bg-destructive/10 text-destructive' : 
                      'bg-secondary text-secondary-foreground'
                    }`}>
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </div>
  );
}
