"use client";
/**
 * Automations — Phase 8.
 * Connect external sources so receipts flow in automatically. Gmail first;
 * the card grid is ready for Drive/Dropbox/Outlook as connectors land.
 */
import { useCallback, useEffect, useState } from "react";
import { Mail, Zap, RefreshCw, Unplug, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

type ProviderStatus = "active" | "needs_reconnect" | "disconnected";

interface ProviderInfo {
  provider: string;
  status: ProviderStatus;
  last_synced_at: string | null;
}

interface StatusResponse {
  providers: Record<string, ProviderInfo>;
  google_oauth_configured: boolean;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AutomationsPage() {
  const { businessId, authedFetch } = useBusiness();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // which action is running
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await authedFetch(`/api/v1/automations/status?business_id=${businessId}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Couldn't load status");
      setStatus(await r.json());
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message ?? "Backend unreachable — is it running?" });
    } finally {
      setLoading(false);
    }
  }, [businessId, authedFetch]);

  // Handle ?connected= / ?error= from the OAuth callback redirect, then load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      setNotice({ kind: "ok", text: `${params.get("connected")} connected — receipts will now sync automatically.` });
      window.history.replaceState({}, "", "/dashboard/automations");
    } else if (params.get("error")) {
      setNotice({ kind: "err", text: params.get("error")! });
      window.history.replaceState({}, "", "/dashboard/automations");
    }
    load();
  }, [load]);

  const connect = async () => {
    setBusy("connect");
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/automations/connect/gmail?business_id=${businessId}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Couldn't start the Google connection");
      window.location.href = d.auth_url; // off to Google's consent screen
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
      setBusy(null);
    }
  };

  const syncNow = async () => {
    setBusy("sync");
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/automations/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, provider: "gmail" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Sync failed to start");
      setNotice({ kind: "ok", text: `${d.message} (up to ${d.max_items_this_run} items this run)` });
      setTimeout(load, 4000); // refresh last-synced after the run has had a moment
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/automations/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, provider: "gmail" }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Disconnect failed");
      setNotice({ kind: "ok", text: "Gmail disconnected. Already-imported receipts are unaffected." });
      load();
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const gmail = status?.providers?.gmail;
  const gmailState: ProviderStatus = gmail?.status ?? "disconnected";

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
          <Zap size={24} color="#818cf8" /> Automations
        </h1>
        <p style={{ color: "#64748b", marginTop: 4 }}>
          Connect your inboxes and drives — receipts with attachments flow straight into the pipeline.
        </p>
      </Reveal>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              marginBottom: 16, padding: "10px 14px", borderRadius: 10, fontSize: "0.85rem",
              color: notice.kind === "ok" ? "#10b981" : "#f87171",
              background: notice.kind === "ok" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${notice.kind === "ok" ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
            }}>
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ color: "#64748b", padding: 40, textAlign: "center" }}>Loading connections…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {/* ── Gmail card ── */}
          <Reveal className="glass-card lift" style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(234,67,53,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Mail size={20} color="#ea4335" />
                </div>
                <div>
                  <div style={{ fontWeight: 650, color: "#f1f5f9" }}>Gmail</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Read-only · attachments become receipts</div>
                </div>
              </div>
              <StatusPill state={gmailState} />
            </div>

            {gmailState === "active" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "#94a3b8", marginBottom: 14 }}>
                <Clock size={13} /> Last synced: {relativeTime(gmail?.last_synced_at ?? null)} · auto-polls every 15 min
              </div>
            )}
            {gmailState === "needs_reconnect" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "#f59e0b", marginBottom: 14 }}>
                <AlertTriangle size={13} /> Access expired or was revoked — reconnect to resume syncing.
              </div>
            )}
            {gmailState === "disconnected" && !status?.google_oauth_configured && (
              <div style={{ fontSize: "0.78rem", color: "#f59e0b", marginBottom: 14 }}>
                Google OAuth isn't configured yet — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in backend/.env.
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {gmailState === "active" ? (
                <>
                  <button className="btn-primary" onClick={syncNow} disabled={busy !== null}
                    style={{ display: "flex", alignItems: "center", gap: 7, opacity: busy ? 0.6 : 1 }}>
                    <RefreshCw size={14} style={busy === "sync" ? { animation: "spin 1s linear infinite" } : undefined} />
                    Sync now
                  </button>
                  <button className="btn-ghost" onClick={disconnect} disabled={busy !== null}
                    style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <Unplug size={14} /> Disconnect
                  </button>
                </>
              ) : (
                <button className="btn-primary" onClick={connect}
                  disabled={busy !== null || !status?.google_oauth_configured}
                  style={{ display: "flex", alignItems: "center", gap: 7, opacity: !status?.google_oauth_configured ? 0.5 : busy ? 0.6 : 1 }}>
                  <Mail size={14} /> {gmailState === "needs_reconnect" ? "Reconnect Gmail" : "Connect Gmail"}
                </button>
              )}
            </div>
          </Reveal>

          {/* ── Coming-soon placeholders (connector interface is ready) ── */}
          {["Google Drive", "Dropbox", "Outlook"].map((name) => (
            <Reveal key={name} delay={0.08} className="glass-card" style={{ padding: 22, opacity: 0.55 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Zap size={18} color="#64748b" />
                </div>
                <div>
                  <div style={{ fontWeight: 650, color: "#cbd5e1" }}>{name}</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Coming soon</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StatusPill({ state }: { state: ProviderStatus }) {
  const meta = {
    active: { color: "#10b981", label: "Connected", icon: CheckCircle2 },
    needs_reconnect: { color: "#f59e0b", label: "Reconnect", icon: AlertTriangle },
    disconnected: { color: "#64748b", label: "Not connected", icon: Unplug },
  }[state];
  const Icon = meta.icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.68rem", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.04em", color: meta.color,
      background: `${meta.color}18`, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
    }}>
      <Icon size={11} /> {meta.label}
    </span>
  );
}
