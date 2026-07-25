"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Receipt, BarChart3, MessageSquare, ReceiptText,
  Target, TrendingUp, BrainCircuit, Zap, History, Users, ShieldAlert, KeyRound, Settings, LogOut
} from "lucide-react";
import { useBusiness } from "@/lib/business-context";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",  href: "/dashboard" },
  { icon: Receipt,         label: "Receipts",   href: "/dashboard/receipts" },
  { icon: BarChart3,       label: "Expenses",   href: "/dashboard/expenses" },
  { icon: ReceiptText,     label: "GST",        href: "/dashboard/gst",       phase: 3 },
  { icon: MessageSquare,   label: "AI Chat",    href: "/dashboard/chat",      phase: 4 },
  { icon: Target,          label: "Budgets",    href: "/dashboard/budgets",   phase: 5 },
  { icon: TrendingUp,      label: "Forecasts",  href: "/dashboard/forecasts", phase: 6 },
  { icon: BrainCircuit,    label: "CFO Agent",  href: "/dashboard/cfo",       phase: 7 },
  { icon: Zap,             label: "Automations",href: "/dashboard/automations",phase: 8 },
  { icon: History,         label: "Audit Log",  href: "/dashboard/audit",    phase: 10 },
  { icon: Users,           label: "Team",       href: "/dashboard/team",     phase: 10 },
  { icon: ShieldAlert,     label: "Approvals",  href: "/dashboard/approvals",phase: 10 },
  { icon: KeyRound,        label: "API Keys",   href: "/dashboard/api-keys", phase: 10 },
];

// Routes that are actually built (unlocked in the nav). Add each page here as it ships.
const BUILT = new Set([
  "/dashboard", "/dashboard/receipts", "/dashboard/expenses", "/dashboard/chat",
  "/dashboard/budgets", "/dashboard/forecasts", "/dashboard/gst", "/dashboard/cfo",
  "/dashboard/automations", "/dashboard/audit", "/dashboard/team", "/dashboard/approvals",
  "/dashboard/api-keys",
]);

export default function Sidebar() {
  const pathname = usePathname();
  const { businessName, signOut } = useBusiness();

  return (
    <aside style={{
      width: "240px", minHeight: "100vh",
      background: "rgba(9, 13, 22, 0.96)",
      backdropFilter: "blur(12px)",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column",
      padding: "22px 12px", gap: "2px", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "0 12px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: 36, height: 36, borderRadius: "10px",
            background: "linear-gradient(135deg, #6366f1, #4f46e5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "18px",
            boxShadow: "0 4px 14px -4px rgba(79,70,229,0.6), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}>🤖</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#f1f5f9" }}>AI FinanceOS</div>
            <div style={{ fontSize: "0.7rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{businessName}</div>
          </div>
        </div>
      </div>

      {/* Nav Items */}
      {navItems.map(({ icon: Icon, label, href, phase }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        const isLocked = !BUILT.has(href); // locked until the page is built
        return (
          <Link key={href} href={isLocked ? "#" : href} style={{ textDecoration: "none" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "11px",
              padding: "9px 12px 9px 14px", borderRadius: "10px", cursor: isLocked ? "default" : "pointer",
              background: isActive ? "rgba(99,102,241,0.12)" : "transparent",
              color: isActive ? "#a5b4fc" : isLocked ? "#3a4661" : "#94a3b8",
              transition: "background-color 0.15s ease, color 0.15s ease",
              position: "relative",
            }}
            onMouseEnter={e => {
              if (!isActive && !isLocked) {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = "rgba(255,255,255,0.04)";
                el.style.color = "#cbd5e1";
              }
            }}
            onMouseLeave={e => {
              if (!isActive && !isLocked) {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = "transparent";
                el.style.color = "#94a3b8";
              }
            }}>
              {isActive && (
                <div style={{
                  position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                  width: 3, height: 18, borderRadius: "0 3px 3px 0",
                  background: "#818cf8",
                }} />
              )}
              <Icon size={17} strokeWidth={isActive ? 2.4 : 2} />
              <span style={{ fontSize: "0.875rem", fontWeight: isActive ? 600 : 500, letterSpacing: "-0.01em" }}>{label}</span>
              {isLocked && (
                <span style={{
                  marginLeft: "auto", fontSize: "0.6rem", fontWeight: 600, padding: "2px 6px",
                  background: "rgba(255,255,255,0.04)", borderRadius: "5px", color: "#3a4661",
                }}>
                  Ph.{phase}
                </span>
              )}
            </div>
          </Link>
        );
      })}

      {/* Bottom settings */}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
        <Link href="/dashboard/settings" style={{ textDecoration: "none" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "9px 12px", borderRadius: "10px", cursor: "pointer",
            color: "#64748b", fontSize: "0.875rem",
          }}>
            <Settings size={17} />
            Settings
          </div>
        </Link>
        <button
          onClick={signOut}
          style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "9px 12px", borderRadius: "10px", cursor: "pointer",
            color: "#64748b", fontSize: "0.875rem", background: "none", border: "none",
            width: "100%", textAlign: "left", fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
