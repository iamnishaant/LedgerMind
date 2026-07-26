"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Receipt, BarChart3, MessageSquare, ReceiptText,
  Target, TrendingUp, BrainCircuit, Zap, History, Users, ShieldAlert, KeyRound, Settings, LogOut
} from "lucide-react";
import { useBusiness } from "@/lib/business-context";
import Logo from "@/components/Logo";

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
      background: "#fffbf3",
      borderRight: "1px solid rgba(36,28,21,0.08)",
      display: "flex", flexDirection: "column",
      padding: "22px 12px", gap: "2px", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "0 12px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Logo size={34} />
          <div style={{ minWidth: 0 }}>
            <div className="serif" style={{ fontWeight: 500, fontSize: "1rem", color: "#241c15" }}>LedgerMind</div>
            <div style={{ fontSize: "0.7rem", color: "#8a7a64", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{businessName}</div>
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
              background: isActive ? "rgba(184,134,46,0.12)" : "transparent",
              color: isActive ? "#9c6b1f" : isLocked ? "#b7a892" : "#6b5d49",
              transition: "background-color 0.15s ease, color 0.15s ease",
              position: "relative",
            }}
            onMouseEnter={e => {
              if (!isActive && !isLocked) {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = "rgba(36,28,21,0.045)";
                el.style.color = "#3d3223";
              }
            }}
            onMouseLeave={e => {
              if (!isActive && !isLocked) {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = "transparent";
                el.style.color = "#6b5d49";
              }
            }}>
              {isActive && (
                <div style={{
                  position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                  width: 3, height: 18, borderRadius: "0 3px 3px 0",
                  background: "#b8862e",
                }} />
              )}
              <Icon size={17} strokeWidth={isActive ? 2.4 : 2} />
              <span style={{ fontSize: "0.875rem", fontWeight: isActive ? 600 : 500, letterSpacing: "-0.01em" }}>{label}</span>
              {isLocked && (
                <span style={{
                  marginLeft: "auto", fontSize: "0.6rem", fontWeight: 600, padding: "2px 6px",
                  background: "rgba(36,28,21,0.05)", borderRadius: "5px", color: "#b7a892",
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
            color: "#8a7a64", fontSize: "0.875rem",
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
            color: "#8a7a64", fontSize: "0.875rem", background: "none", border: "none",
            width: "100%", textAlign: "left", fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#b23a2e")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#8a7a64")}
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
