"use client";
/**
 * API Keys + Export — Phase 10 (Enterprise).
 * Programmatic access for connecting an external ERP/accounting tool, plus a
 * one-click CSV download for the same data. Key creation/revocation are
 * owner-only; the backend enforces this independently either way.
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Copy, Check, Ban, Download, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export default function ApiKeysPage() {
  const { businessId, userId, authedFetch } = useBusiness();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [keysRes, teamRes] = await Promise.all([
        authedFetch(`/api/v1/api-keys?business_id=${businessId}`),
        authedFetch(`/api/v1/team?business_id=${businessId}`),
      ]);
      if (!keysRes.ok) throw new Error((await keysRes.json().catch(() => ({}))).detail ?? "Couldn't load API keys");
      setKeys((await keysRes.json()).keys ?? []);
      if (teamRes.ok) {
        const team = await teamRes.json();
        setIsOwner(team.members?.some((m: any) => m.user_id === userId && m.role === "owner") ?? false);
      }
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message ?? "Backend unreachable — is it running?" });
    } finally {
      setLoading(false);
    }
  }, [businessId, userId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const createKey = async () => {
    if (!newName.trim()) return;
    setBusy("create");
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, name: newName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Couldn't create the key");
      setRevealedKey(d.key);
      setCopied(false);
      setNewName("");
      setCreating(false);
      load();
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const revokeKey = async (keyId: string) => {
    setBusy(keyId);
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/api-keys/${keyId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Couldn't revoke this key");
      load();
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const copyKey = async () => {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCsv = async () => {
    setBusy("export");
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/export/expenses.csv?business_id=${businessId}`);
      if (!r.ok) throw new Error("Couldn't generate the export");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "expenses.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
            <KeyRound size={24} color="#818cf8" /> API Keys & Export
          </h1>
          <p style={{ color: "#64748b", marginTop: 4 }}>Programmatic access for connecting an ERP or accounting tool.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-ghost" onClick={downloadCsv} disabled={busy !== null}
            style={{ display: "flex", alignItems: "center", gap: 7, opacity: busy ? 0.6 : 1 }}>
            <Download size={14} /> Download CSV
          </button>
          {isOwner && (
            <button className="btn-primary" onClick={() => setCreating(true)} disabled={busy !== null}
              style={{ display: "flex", alignItems: "center", gap: 7, opacity: busy ? 0.6 : 1 }}>
              <Plus size={14} /> New key
            </button>
          )}
        </div>
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

        {creating && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="glass-card" style={{ marginBottom: 16, padding: "14px 16px", display: "flex", gap: 10, alignItems: "center" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Key name, e.g. Zoho Books sync"
              autoFocus
              style={{
                flex: 1, background: "rgba(26,34,53,0.6)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8, padding: "8px 12px", color: "#f1f5f9", fontSize: "0.85rem", outline: "none",
              }}
            />
            <button className="btn-primary" disabled={busy !== null || !newName.trim()} onClick={createKey}>Create</button>
            <button className="btn-ghost" onClick={() => { setCreating(false); setNewName(""); }}>Cancel</button>
          </motion.div>
        )}

        {revealedKey && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              marginBottom: 16, padding: "12px 14px", borderRadius: 10,
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
            }}>
            <div style={{ fontSize: "0.78rem", color: "#fbbf24", marginBottom: 8, fontWeight: 600 }}>
              Copy this now — it won't be shown again:
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <code style={{ flex: 1, minWidth: 200, fontSize: "0.78rem", color: "#fde68a", background: "rgba(0,0,0,0.25)", padding: "6px 10px", borderRadius: 6, overflowX: "auto" }}>
                {revealedKey}
              </code>
              <button className="btn-ghost" onClick={copyKey} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", padding: "6px 10px" }}>
                {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={() => setRevealedKey(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ color: "#64748b", padding: 40, textAlign: "center" }}>Loading keys…</div>
      ) : keys.length === 0 ? (
        <div className="glass-card" style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
          No API keys yet. {isOwner && "Create one to connect an external tool."}
        </div>
      ) : (
        <Stagger style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {keys.map((k) => (
            <StaggerItem key={k.id}>
              <div className="glass-card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, opacity: k.revoked_at ? 0.5 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#f1f5f9" }}>{k.name}</div>
                  <div style={{ fontSize: "0.76rem", color: "#64748b", fontFamily: "monospace" }}>
                    {k.key_prefix}… {k.revoked_at && <span style={{ color: "#f87171", fontFamily: "inherit" }}>· revoked</span>}
                  </div>
                </div>
                <div style={{ fontSize: "0.74rem", color: "#64748b", textAlign: "right" }}>
                  {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString("en-IN")}` : "Never used"}
                </div>
                {isOwner && !k.revoked_at && (
                  <button
                    disabled={busy !== null}
                    onClick={() => revokeKey(k.id)}
                    title="Revoke this key"
                    style={{
                      background: "none", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8,
                      padding: "6px 8px", cursor: "pointer", color: "#f87171", opacity: busy === k.id ? 0.6 : 1,
                    }}>
                    <Ban size={13} />
                  </button>
                )}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
