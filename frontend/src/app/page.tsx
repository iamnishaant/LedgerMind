"use client";
/**
 * AI FinanceOS — animated landing page (the "vibe coded" marketing site).
 * Built with Framer Motion (motion/react). Dark glass aesthetic matching the app.
 */
import Link from "next/link";
import {
  ScanLine, Calculator, ReceiptText, ShieldCheck, TrendingUp, Wallet,
  Building2, Repeat, BellRing, BrainCircuit, FileSearch, Sparkles,
  ArrowRight, Check, Upload, GitBranch, Zap, Star,
} from "lucide-react";
import {
  motion, Reveal, Stagger, StaggerItem, AnimatedNumber,
} from "@/components/motion/Primitives";
import ParticleNetwork from "@/components/ui/particle-network";

const C = {
  bg: "#0a0f1e", text: "#f1f5f9", muted: "#64748b", muted2: "#94a3b8",
  primary: "#6366f1", glow: "#818cf8", accent: "#22d3ee",
  success: "#10b981", warning: "#f59e0b", pink: "#ec4899", violet: "#8b5cf6",
};

// ══════════════════════════════════════════════════════════════
export default function Landing() {
  return (
    <div style={{ background: C.bg, color: C.text, overflowX: "hidden" }}>
      <Nav />
      <Hero />
      <Marquee />
      <Stats />
      <Problem />
      <HowItWorks />
      <Agents />
      <Roadmap />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────
function Nav() {
  return (
    <motion.nav
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "sticky", top: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", maxWidth: 1180, margin: "0 auto",
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={logoBox}>🤖</div>
        <span style={{ fontWeight: 700, fontSize: "1.02rem" }}>AI FinanceOS</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 26 }} className="nav-links">
        {[["Product", "#how"], ["Agents", "#agents"], ["Roadmap", "#roadmap"], ["Pricing", "#pricing"]].map(([l, h]) => (
          <a key={l} href={h} style={navLink}>{l}</a>
        ))}
      </div>
      <Link href="/dashboard" style={{ textDecoration: "none" }}>
        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 7 }}>
          Launch App <ArrowRight size={15} />
        </button>
      </Link>
    </motion.nav>
  );
}

// ── Hero ──────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{ position: "relative", padding: "72px 24px 40px", overflow: "hidden" }}>
      {/* interactive particle-network background (components/ui/particle-network.tsx) */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <ParticleNetwork
          className="absolute inset-0"
          particleColor="rgba(99, 102, 241, 0.85)"
          lineColor="rgba(129, 140, 248, 0.4)"
          lineColorNearMouse="rgba(34, 211, 238, 0.9)"
        />
      </div>

      <div className="container" style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="eyebrow"><Sparkles size={14} /> Agentic finance for small business</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          style={{
            fontSize: "clamp(2.4rem, 6vw, 4.2rem)", fontWeight: 800, lineHeight: 1.05,
            letterSpacing: "-0.02em", margin: "22px auto 0", maxWidth: 900,
          }}
        >
          Your virtual{" "}
          <span className="gradient-text">accountant, bookkeeper</span>
          <br /> & CFO — in one platform.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          style={{ fontSize: "clamp(1rem, 2vw, 1.18rem)", color: C.muted2, maxWidth: 620, margin: "22px auto 0", lineHeight: 1.6 }}
        >
          Snap a receipt. A team of AI agents reads it, books it, catches GST credits,
          flags duplicates, and forecasts your cash flow — while you stay in control.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 34, flexWrap: "wrap" }}
        >
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <button className="btn-primary btn-lg" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Open the dashboard <ArrowRight size={17} />
            </button>
          </Link>
          <a href="#how" style={{ textDecoration: "none" }}>
            <button className="btn-ghost btn-lg">See how it works</button>
          </a>
        </motion.div>

        <HeroPreview />
      </div>
    </section>
  );
}

function HeroPreview() {
  const bars = [62, 88, 44, 74, 30, 96, 58];
  return (
    <motion.div
      initial={{ opacity: 0, y: 60, rotateX: 12 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{ perspective: 1200, marginTop: 56 }}
    >
      <div className="ring-card" style={{ maxWidth: 880, margin: "0 auto", padding: 22, textAlign: "left" }}>
        {/* window chrome */}
        <div style={{ display: "flex", gap: 7, marginBottom: 18 }}>
          {["#ef4444", "#f59e0b", "#10b981"].map((c) => (
            <span key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c, opacity: 0.8 }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          {[
            { label: "Total spend", value: "₹1,24,820", color: C.primary },
            { label: "GST recoverable", value: "₹18,430", color: C.success },
            { label: "Receipts", value: "47", color: C.accent },
            { label: "Needs review", value: "3", color: C.warning },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 + i * 0.1 }}
              style={{ padding: "14px 16px", borderRadius: 12, background: `${s.color}12`, border: `1px solid ${s.color}26` }}
            >
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: "0.72rem", color: C.muted }}>{s.label}</div>
            </motion.div>
          ))}
        </div>
        {/* mini chart */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120, padding: "0 4px" }}>
          {bars.map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }} animate={{ height: `${h}%` }}
              transition={{ duration: 0.8, delay: 0.9 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              style={{ flex: 1, borderRadius: "6px 6px 0 0", background: `linear-gradient(180deg, ${C.glow}, ${C.primary})` }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Marquee keyword strip ─────────────────────────────────────
function Marquee() {
  const items = [
    "PaddleOCR extraction", "GST Input Tax Credit", "Duplicate detection", "Cash-flow forecasting",
    "Human-in-the-loop review", "LangGraph orchestration", "Fraud anomaly flags", "Auto-categorization",
  ];
  const doubled = [...items, ...items];
  return (
    <div className="marquee-mask" style={{ padding: "26px 0", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="marquee-track" style={{ gap: 40 }}>
        {doubled.map((t, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 10, color: C.muted2, fontSize: "0.9rem", fontWeight: 500, whiteSpace: "nowrap" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent }} /> {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Stats ─────────────────────────────────────────────────────
function Stats() {
  const stats = [
    { n: 11, suffix: "", label: "Specialized AI agents", format: false },
    { n: 85, suffix: "%", label: "Confidence review gate", format: false },
    { n: 10, suffix: "", label: "Phase product roadmap", format: false },
    { n: 18430, prefix: "₹", label: "Avg. GST credit surfaced", format: true },
  ];
  return (
    <section className="section" style={{ paddingTop: 64, paddingBottom: 64 }}>
      <Stagger className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 18 }}>
        {stats.map((s) => (
          <StaggerItem key={s.label}>
            <div style={{ textAlign: "center", padding: "10px 8px" }}>
              <div className="gradient-text" style={{ fontSize: "2.6rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                <AnimatedNumber value={s.n} prefix={s.prefix ?? ""} suffix={s.suffix ?? ""} format={s.format} />
              </div>
              <div style={{ color: C.muted, fontSize: "0.85rem", marginTop: 4 }}>{s.label}</div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

// ── Problem ───────────────────────────────────────────────────
function Problem() {
  const pains = [
    "Lost receipts & bookkeeping that's always a month behind",
    "Expenses miscategorized — or not categorized at all",
    "GST Input Tax Credits quietly slipping away",
    "Zero real-time visibility into cash flow",
    "Tax season = a shoebox of paper and panic",
    "No one actually reading the numbers for insight",
  ];
  return (
    <section className="section">
      <div className="container two-col">
        <Reveal>
          <span className="eyebrow">The problem</span>
          <h2 style={h2Style}>Running the numbers by hand is quietly costing you.</h2>
          <p style={{ color: C.muted2, lineHeight: 1.65, marginTop: 16 }}>
            Millions of small businesses still run on paper receipts, spreadsheets, WhatsApp
            images and manual bookkeeping. Owners lose hours every month to organizing instead
            of growing.
          </p>
        </Reveal>
        <Stagger style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pains.map((p) => (
            <StaggerItem key={p}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", borderRadius: 12, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                <span style={{ color: "#ef4444", fontSize: "1.1rem", lineHeight: 1.3 }}>✕</span>
                <span style={{ color: C.text, fontSize: "0.92rem" }}>{p}</span>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { icon: Upload, color: C.primary, title: "1 · Upload anything", body: "Drag in receipts, invoices, or bank statements — JPG, PNG or PDF. PaddleOCR reads them with bounding-box precision." },
    { icon: GitBranch, color: C.accent, title: "2 · Agents reason", body: "A LangGraph orchestrator routes each document through OCR → Accounting → GST agents. Numbers are parsed deterministically — never guessed by an LLM." },
    { icon: ShieldCheck, color: C.success, title: "3 · You stay in control", body: "Low-confidence extractions pause for a one-tap human review, then resume automatically. Every step is logged to an audit trail." },
  ];
  return (
    <section id="how" className="section" style={{ background: "linear-gradient(180deg, transparent, rgba(99,102,241,0.03), transparent)" }}>
      <div className="container">
        <Reveal style={{ textAlign: "center", marginBottom: 48 }}>
          <span className="eyebrow"><Zap size={14} /> How it works</span>
          <h2 style={{ ...h2Style, margin: "16px auto 0", maxWidth: 640 }}>From shoebox to insight in three steps</h2>
        </Reveal>
        <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <StaggerItem key={s.title}>
                <div className="ring-card" style={{ padding: 26, height: "100%" }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                    <Icon size={22} color={s.color} />
                  </div>
                  <h3 style={{ fontSize: "1.08rem", fontWeight: 700, marginBottom: 10 }}>{s.title}</h3>
                  <p style={{ color: C.muted2, fontSize: "0.9rem", lineHeight: 1.6 }}>{s.body}</p>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}

// ── Agents ────────────────────────────────────────────────────
function Agents() {
  const roster = [
    { icon: ScanLine, color: C.primary, name: "OCR Agent", desc: "Extracts data from documents" },
    { icon: Calculator, color: C.accent, name: "Accounting Agent", desc: "Books & categorizes expenses" },
    { icon: ReceiptText, color: C.success, name: "GST Agent", desc: "Tax compliance & ITC detection" },
    { icon: Wallet, color: C.warning, name: "Budget Agent", desc: "Monitors spending limits" },
    { icon: TrendingUp, color: C.pink, name: "Forecast Agent", desc: "Predicts cash flow & runway" },
    { icon: ShieldCheck, color: C.violet, name: "Fraud Agent", desc: "Flags anomalous expenses" },
    { icon: Building2, color: C.accent, name: "Vendor Agent", desc: "Profiles your suppliers" },
    { icon: Repeat, color: C.primary, name: "Subscription Agent", desc: "Tracks recurring software" },
    { icon: BellRing, color: C.warning, name: "Reminder Agent", desc: "Payment reminders & follow-ups" },
    { icon: BrainCircuit, color: C.success, name: "CFO Agent", desc: "Your AI financial advisor" },
    { icon: FileSearch, color: C.pink, name: "Audit Agent", desc: "Maintains full audit trails" },
    { icon: Sparkles, color: C.violet, name: "Negotiation Agent", desc: "Finds cheaper vendors (soon)" },
  ];
  return (
    <section id="agents" className="section">
      <div className="container">
        <Reveal style={{ textAlign: "center", marginBottom: 44 }}>
          <span className="eyebrow"><BrainCircuit size={14} /> The agent roster</span>
          <h2 style={{ ...h2Style, margin: "16px auto 0", maxWidth: 640 }}>Not one model. A whole finance team.</h2>
          <p style={{ color: C.muted2, maxWidth: 560, margin: "14px auto 0", lineHeight: 1.6 }}>
            Each agent owns one job and hands off to the next through a shared, checkpointed graph.
          </p>
        </Reveal>
        <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }} amount={0.1}>
          {roster.map((a) => {
            const Icon = a.icon;
            return (
              <StaggerItem key={a.name}>
                <div className="ring-card" style={{ padding: 20, display: "flex", gap: 14, alignItems: "center", height: "100%" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: `${a.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={20} color={a.color} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 650, fontSize: "0.92rem" }}>{a.name}</div>
                    <div style={{ color: C.muted, fontSize: "0.78rem", marginTop: 2 }}>{a.desc}</div>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}

// ── Roadmap ───────────────────────────────────────────────────
function Roadmap() {
  const phases = [
    { n: "1", name: "Expense Tracking MVP", status: "building" },
    { n: "2", name: "AI Bookkeeper", status: "building" },
    { n: "3", name: "GST Intelligence", status: "planned" },
    { n: "4", name: "AI Chat (RAG)", status: "building" },
    { n: "5", name: "Budget Intelligence", status: "building" },
    { n: "6", name: "Forecasting", status: "building" },
    { n: "7", name: "AI CFO", status: "planned" },
    { n: "8", name: "Automation & Integrations", status: "planned" },
    { n: "9", name: "Multi-Agent Collaboration", status: "planned" },
    { n: "10", name: "Enterprise", status: "planned" },
  ];
  return (
    <section id="roadmap" className="section" style={{ background: "linear-gradient(180deg, transparent, rgba(34,211,238,0.03), transparent)" }}>
      <div className="container">
        <Reveal style={{ textAlign: "center", marginBottom: 44 }}>
          <span className="eyebrow"><GitBranch size={14} /> Product roadmap</span>
          <h2 style={{ ...h2Style, margin: "16px auto 0", maxWidth: 640 }}>Ten phases, from MVP to enterprise</h2>
        </Reveal>
        <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }} amount={0.08}>
          {phases.map((p) => {
            const building = p.status === "building";
            return (
              <StaggerItem key={p.n}>
                <div className="ring-card" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: "0.95rem",
                    background: building ? "linear-gradient(135deg, #6366f1, #22d3ee)" : "rgba(255,255,255,0.05)",
                    color: building ? "#fff" : C.muted,
                  }}>{p.n}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{p.name}</div>
                    <span style={{ fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: building ? C.success : C.muted }}>
                      {building ? "● Building" : "Planned"}
                    </span>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}

// ── Pricing ───────────────────────────────────────────────────
function Pricing() {
  const tiers = [
    { name: "Free", price: "₹0", sub: "/forever", features: ["20 receipts / month", "OCR extraction", "Expense dashboard"], highlight: false },
    { name: "Professional", price: "₹999", sub: "/month", features: ["Unlimited OCR", "AI Chat & forecasting", "GST & budgets", "Duplicate + fraud flags"], highlight: true },
    { name: "Business", price: "₹2,999", sub: "/month", features: ["Everything in Pro", "Teams & approvals", "Multiple businesses", "Advanced analytics"], highlight: false },
  ];
  return (
    <section id="pricing" className="section">
      <div className="container">
        <Reveal style={{ textAlign: "center", marginBottom: 44 }}>
          <span className="eyebrow"><Wallet size={14} /> Pricing</span>
          <h2 style={{ ...h2Style, margin: "16px auto 0", maxWidth: 620 }}>Start free. Upgrade when the agents pay for themselves.</h2>
        </Reveal>
        <Stagger style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, alignItems: "stretch" }}>
          {tiers.map((t) => (
            <StaggerItem key={t.name}>
              <div className="ring-card" style={{
                padding: 28, height: "100%", display: "flex", flexDirection: "column",
                border: t.highlight ? "1px solid rgba(99,102,241,0.55)" : undefined,
                boxShadow: t.highlight ? "0 12px 48px -14px rgba(99,102,241,0.5)" : undefined,
                position: "relative",
              }}>
                {t.highlight && (
                  <span style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 12px", borderRadius: 999, background: "linear-gradient(135deg, #6366f1, #22d3ee)", color: "#fff" }}>
                    Most popular
                  </span>
                )}
                <div style={{ fontSize: "0.9rem", color: C.muted2, fontWeight: 600 }}>{t.name}</div>
                <div style={{ margin: "10px 0 20px", display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.02em" }}>{t.price}</span>
                  <span style={{ color: C.muted, fontSize: "0.9rem" }}>{t.sub}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: 1 }}>
                  {t.features.map((f) => (
                    <div key={f} style={{ display: "flex", gap: 9, alignItems: "center", fontSize: "0.88rem", color: C.text }}>
                      <Check size={16} color={C.success} style={{ flexShrink: 0 }} /> {f}
                    </div>
                  ))}
                </div>
                <Link href="/dashboard" style={{ textDecoration: "none", marginTop: 24 }}>
                  <button className={t.highlight ? "btn-primary" : "btn-ghost"} style={{ width: "100%" }}>
                    {t.highlight ? "Get started" : "Choose plan"}
                  </button>
                </Link>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="section">
      <Reveal className="container">
        <div className="ring-card" style={{ padding: "56px 32px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div className="orb" style={{ width: 400, height: 400, top: -180, left: "50%", marginLeft: -200, background: "radial-gradient(circle, #6366f1, transparent 70%)", opacity: 0.35 }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{ ...h2Style, maxWidth: 620, margin: "0 auto" }}>Let the agents run your books.</h2>
            <p style={{ color: C.muted2, maxWidth: 500, margin: "16px auto 0", lineHeight: 1.6 }}>
              Upload your first receipt and watch the pipeline light up in real time.
            </p>
            <Link href="/dashboard" style={{ textDecoration: "none" }}>
              <button className="btn-primary btn-lg" style={{ marginTop: 28, display: "inline-flex", alignItems: "center", gap: 8 }}>
                Launch the dashboard <ArrowRight size={17} />
              </button>
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "34px 24px" }}>
      <div className="container" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={logoBox}>🤖</div>
          <span style={{ fontWeight: 700 }}>AI FinanceOS</span>
        </div>
        <div style={{ color: C.muted, fontSize: "0.82rem" }}>
          An agentic financial operating system for small businesses.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <a href="#how" style={navLink}>Product</a>
          <a href="#pricing" style={navLink}>Pricing</a>
          <a href="https://github.com" target="_blank" rel="noreferrer" style={{ ...navLink, display: "flex", alignItems: "center", gap: 6 }}>
            <Star size={15} /> Repo
          </a>
        </div>
      </div>
    </footer>
  );
}

// ── shared style tokens ───────────────────────────────────────
const logoBox: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9,
  background: "linear-gradient(135deg, #6366f1, #22d3ee)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 17, boxShadow: "0 0 18px rgba(99,102,241,0.4)",
};
const navLink: React.CSSProperties = { color: "#94a3b8", textDecoration: "none", fontSize: "0.88rem", fontWeight: 500 };
const h2Style: React.CSSProperties = { fontSize: "clamp(1.6rem, 3.4vw, 2.4rem)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.15 };
