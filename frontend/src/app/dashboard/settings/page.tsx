"use client";
/**
 * Settings — account/business info, onboarding controls (replay tour, reset page
 * hints), and a plain-language reference for the platform's server-side
 * configuration (what each setting controls, its recommended value, impact, and
 * whether changing it touches existing data).
 */
import { useState } from "react";
import { Settings as SettingsIcon, PlayCircle, RotateCcw, Building2, User, LifeBuoy, SlidersHorizontal, Check } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";
import { useHelp } from "@/lib/help/HelpProvider";

interface SettingRef {
  name: string;
  env: string;
  controls: string;
  recommended: string;
  impact: string;
  affectsData: string;
}

const SETTINGS_REFERENCE: SettingRef[] = [
  {
    name: "Chat model", env: "CHAT_MODEL",
    controls: "Which model powers the interactive AI Chat only — the heavier reasoning agents keep the larger model.",
    recommended: "meta/llama-3.1-8b-instruct — fast, and the injected financial snapshot means most questions need no extra tool call.",
    impact: "Smaller = faster first token and lower latency; larger = more nuanced answers but slower on the free tier.",
    affectsData: "No — only affects how new answers are generated.",
  },
  {
    name: "AI provider", env: "LLM_PROVIDER",
    controls: "The AI provider all agents use: nvidia, openai or anthropic.",
    recommended: "nvidia — free-tier hosted models, no per-token bill.",
    impact: "Determines cost and speed. NVIDIA's free tier is slower; paid providers are faster and more capable.",
    affectsData: "No.",
  },
  {
    name: "OCR review threshold", env: "OCR_CONFIDENCE_THRESHOLD",
    controls: "Below this OCR confidence, a receipt is flagged for human review instead of being booked automatically.",
    recommended: "0.85 — a good balance of automation and safety.",
    impact: "Higher = safer (more review, fewer silent mistakes); lower = more automation but higher error risk.",
    affectsData: "Future receipts only — existing expenses are never changed.",
  },
  {
    name: "Gmail sync batch cap", env: "SYNC_MAX_ITEMS_PER_RUN",
    controls: "The maximum number of receipts imported from Gmail in a single sync run.",
    recommended: "20 — protects the OCR pipeline from a first-connect flood.",
    impact: "Higher catches up faster but in heavier bursts; lower is gentler on load and spreads work across more runs.",
    affectsData: "No — it only paces processing; remaining items are picked up on the next sync.",
  },
  {
    name: "Gmail lookback window", env: "GMAIL_LOOKBACK_DAYS",
    controls: "How far back in Gmail to scan for receipt attachments on each sync.",
    recommended: "30 days.",
    impact: "A larger window finds older receipts but scans more mail each run.",
    affectsData: "No.",
  },
  {
    name: "Upload size limit", env: "MAX_UPLOAD_SIZE_BYTES",
    controls: "The largest receipt file the server will accept.",
    recommended: "10 MB.",
    impact: "Higher allows bigger scans but risks slow processing and abuse; lower rejects oversized files early.",
    affectsData: "Future uploads only.",
  },
  {
    name: "AI timeout & retries", env: "LLM_REQUEST_TIMEOUT · LLM_MAX_RETRIES",
    controls: "How long to wait for a model response, and how many times to retry a transient failure.",
    recommended: "60s timeout, 2 retries.",
    impact: "A longer timeout tolerates slow free-tier calls; more retries ride out network blips but can delay a surfaced error.",
    affectsData: "No.",
  },
];

export default function SettingsPage() {
  const { fullName, businessName, businessId, userId } = useBusiness();
  const { startTour, resetHints } = useHelp();
  const [flash, setFlash] = useState<string | null>(null);

  const notify = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 2600); };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 10 }}>
          <SettingsIcon size={24} color="var(--color-primary-glow)" /> Settings
        </h1>
        <p style={{ color: "var(--color-text-dim)", marginTop: 4 }}>Your account, onboarding controls, and a reference for how the platform is configured.</p>
      </Reveal>

      {flash && (
        <div role="status" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, fontSize: "0.85rem", color: "var(--color-success)", background: "rgba(47,143,82,0.09)", border: "1px solid rgba(47,143,82,0.24)", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Check size={15} /> {flash}
        </div>
      )}

      {/* Account & business */}
      <Reveal className="glass-card" style={{ padding: 22, marginBottom: 18 }}>
        <SectionTitle icon={User} label="Account & business" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 4 }}>
          <Field label="Name" value={fullName} />
          <Field label="Business" value={businessName} icon={Building2} />
          <Field label="Business ID" value={businessId} mono />
          <Field label="User ID" value={userId} mono />
        </div>
      </Reveal>

      {/* Onboarding */}
      <Reveal className="glass-card" style={{ padding: 22, marginBottom: 18 }}>
        <SectionTitle icon={LifeBuoy} label="Help & onboarding" />
        <p style={{ fontSize: "0.86rem", color: "var(--color-text-muted)", lineHeight: 1.55, margin: "2px 0 16px" }}>
          Replay the guided tour or bring back the first-visit tips on each page. Progress is stored on this device.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={() => startTour()} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <PlayCircle size={16} /> Replay product tour
          </button>
          <button className="btn-ghost" onClick={() => { resetHints(); notify("Page hints reset — they'll reappear as you visit each page."); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            <RotateCcw size={15} /> Reset page hints
          </button>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--color-text-dim)", marginTop: 12 }}>
          Tip: press <kbd style={kbd}>?</kbd> on any page to open its contextual help.
        </p>
      </Reveal>

      {/* Configuration reference */}
      <Reveal className="glass-card" style={{ padding: 22 }}>
        <SectionTitle icon={SlidersHorizontal} label="Configuration reference" />
        <p style={{ fontSize: "0.86rem", color: "var(--color-text-muted)", lineHeight: 1.55, margin: "2px 0 18px" }}>
          These are configured server-side (in the backend environment). This reference explains each one so you know what to change and what it affects.
        </p>
        <Stagger style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {SETTINGS_REFERENCE.map((s) => (
            <StaggerItem key={s.env}>
              <div style={{ padding: "16px 18px", borderRadius: 12, background: "var(--color-surface)", border: "1px solid var(--color-stroke)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--color-text)" }}>{s.name}</span>
                  <code className="mono" style={{ fontSize: "0.72rem", color: "var(--color-primary-glow)", background: "rgba(184,134,46,0.1)", padding: "2px 8px", borderRadius: 6 }}>{s.env}</code>
                </div>
                <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0, fontSize: "0.83rem", lineHeight: 1.5 }}>
                  <Row term="Controls" desc={s.controls} />
                  <Row term="Recommended" desc={s.recommended} accent />
                  <Row term="Impact" desc={s.impact} />
                  <Row term="Affects existing data" desc={s.affectsData} />
                </dl>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Reveal>
    </div>
  );
}

const kbd: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--color-text)",
  background: "var(--color-surface-2)", border: "1px solid var(--color-stroke)", borderBottomWidth: 2, borderRadius: 5, padding: "1px 6px",
};

function SectionTitle({ icon: Icon, label }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string }) {
  return (
    <h2 style={{ display: "flex", alignItems: "center", gap: 9, fontSize: "1rem", fontWeight: 600, color: "var(--color-text)", marginBottom: 14 }}>
      <Icon size={17} color="var(--color-primary-glow)" /> {label}
    </h2>
  );
}

function Field({ label, value, mono, icon: Icon }: { label: string; value: string; mono?: boolean; icon?: React.ComponentType<{ size?: number; color?: string }> }) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-dim)", marginBottom: 4 }}>{label}</div>
      <div className={mono ? "mono" : undefined} style={{ fontSize: mono ? "0.78rem" : "0.92rem", color: "var(--color-text)", display: "flex", alignItems: "center", gap: 7, overflowWrap: "anywhere" }}>
        {Icon && <Icon size={15} color="var(--color-text-dim)" />} {value}
      </div>
    </div>
  );
}

function Row({ term, desc, accent }: { term: string; desc: string; accent?: boolean }) {
  return (
    <>
      <dt style={{ fontWeight: 600, color: "var(--color-text-dim)", whiteSpace: "nowrap" }}>{term}</dt>
      <dd style={{ margin: 0, color: accent ? "#9c6b1f" : "var(--color-text)", fontWeight: accent ? 600 : 400 }}>{desc}</dd>
    </>
  );
}
