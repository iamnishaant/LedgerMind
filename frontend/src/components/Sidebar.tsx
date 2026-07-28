"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Receipt, BarChart3, MessageSquare, ReceiptText,
  Target, TrendingUp, BrainCircuit, Zap, History, Users, ShieldAlert, KeyRound, Settings, LogOut,
  Sun, Moon
} from "lucide-react";
import { useBusiness } from "@/lib/business-context";
import { useTheme } from "@/lib/theme";
import Logo from "@/components/Logo";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",  href: "/dashboard",            desc: "Your month at a glance — spend, GST and anything needing review." },
  { icon: Receipt,         label: "Receipts",   href: "/dashboard/receipts",   desc: "Upload receipts; agents extract and categorize them automatically." },
  { icon: BarChart3,       label: "Expenses",   href: "/dashboard/expenses",   desc: "The full ledger — search, filter and correct categorizations." },
  { icon: ReceiptText,     label: "GST",        href: "/dashboard/gst",       phase: 3,  desc: "Input Tax Credit you can recover, and what's blocking the rest." },
  { icon: MessageSquare,   label: "AI Chat",    href: "/dashboard/chat",      phase: 4,  desc: "Ask about your finances in plain English — answers from real data." },
  { icon: Target,          label: "Budgets",    href: "/dashboard/budgets",   phase: 5,  desc: "Set category limits and get run-rate overspend alerts." },
  { icon: TrendingUp,      label: "Forecasts",  href: "/dashboard/forecasts", phase: 6,  desc: "Project future spend from your history." },
  { icon: BrainCircuit,    label: "CFO Agent",  href: "/dashboard/cfo",       phase: 7,  desc: "A prioritized brief: risks, opportunities and recommended actions." },
  { icon: Zap,             label: "Automations",href: "/dashboard/automations",phase: 8, desc: "Connect Gmail to import receipt attachments automatically." },
  { icon: History,         label: "Audit Log",  href: "/dashboard/audit",    phase: 10, desc: "A read-only trail of every agent run and its outcome." },
  { icon: Users,           label: "Team",       href: "/dashboard/team",     phase: 10, desc: "Manage who can access this business and their roles." },
  { icon: ShieldAlert,     label: "Approvals",  href: "/dashboard/approvals",phase: 10, desc: "Sign off high-risk expenses flagged by the Fraud agent." },
  { icon: KeyRound,        label: "API Keys",   href: "/dashboard/api-keys", phase: 10, desc: "Programmatic access for ERP integrations, plus CSV export." },
];

const slug = (label: string) => label.toLowerCase().replace(/\s+/g, "-");

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
  const { theme, toggle } = useTheme();

  return (
    <aside data-tour="sidebar" aria-label="Main navigation" style={{
      width: "240px", minHeight: "100vh",
      background: "var(--color-sidebar)",
      borderRight: "1px solid var(--color-stroke)",
      display: "flex", flexDirection: "column",
      padding: "22px 12px", gap: "2px", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "0 12px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Logo size={34} />
          <div style={{ minWidth: 0 }}>
            <div className="serif" style={{ fontWeight: 500, fontSize: "1rem", color: "var(--color-text)" }}>LedgerMind</div>
            <div style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{businessName}</div>
          </div>
        </div>
      </div>

      {/* Nav Items */}
      {navItems.map(({ icon: Icon, label, href, phase, desc }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        const isLocked = !BUILT.has(href); // locked until the page is built
        return (
          <Link key={href} href={isLocked ? "#" : href} data-tour={`nav-${slug(label)}`}
            title={isLocked ? `${label} — coming in Phase ${phase}` : desc}
            aria-label={`${label}. ${desc}`} style={{ textDecoration: "none" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "11px",
              padding: "9px 12px 9px 14px", borderRadius: "10px", cursor: isLocked ? "default" : "pointer",
              background: isActive ? "rgba(184,134,46,0.12)" : "transparent",
              color: isActive ? "var(--color-primary-glow)" : isLocked ? "var(--color-text-dim)" : "var(--color-text-muted)",
              transition: "background-color 0.15s ease, color 0.15s ease",
              position: "relative",
            }}
            onMouseEnter={e => {
              if (!isActive && !isLocked) {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = "var(--ghost-bg-hover)";
                el.style.color = "var(--color-text)";
              }
            }}
            onMouseLeave={e => {
              if (!isActive && !isLocked) {
                const el = e.currentTarget as HTMLDivElement;
                el.style.background = "transparent";
                el.style.color = "var(--color-text-muted)";
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
                  background: "var(--ghost-bg-hover)", borderRadius: "5px", color: "var(--color-text-dim)",
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
        <button
          onClick={toggle}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "9px 12px", borderRadius: "10px", cursor: "pointer",
            color: "var(--color-text-muted)", fontSize: "0.875rem", background: "none", border: "none",
            width: "100%", textAlign: "left", fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <Link href="/dashboard/settings" style={{ textDecoration: "none" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "9px 12px", borderRadius: "10px", cursor: "pointer",
            color: "var(--color-text-muted)", fontSize: "0.875rem",
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
            color: "var(--color-text-muted)", fontSize: "0.875rem", background: "none", border: "none",
            width: "100%", textAlign: "left", fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
