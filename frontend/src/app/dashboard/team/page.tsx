"use client";
/**
 * Team — Phase 10 (Enterprise: Teams & Roles).
 * Manage who has access to this business. Owner-only actions (invite, role
 * change, remove) are hidden/disabled for plain members — the backend
 * enforces the same rule independently, this is just so the UI doesn't
 * offer buttons that would just 403.
 */
import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, Crown, Trash2, Copy, Check, Clock, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

interface Member {
  id: string;
  user_id: string;
  role: "owner" | "member";
  email: string | null;
  full_name: string | null;
  created_at: string;
}

interface Invite {
  id: string;
  role: string;
  token: string;
  expires_at: string;
  created_at: string;
}

interface TeamResponse {
  members: Member[];
  pending_invites: Invite[];
}

function initials(name: string | null, email: string | null): string {
  const source = name || email || "?";
  return source.trim().slice(0, 2).toUpperCase();
}

export default function TeamPage() {
  const { businessId, userId, authedFetch } = useBusiness();
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authedFetch(`/api/v1/team?business_id=${businessId}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Couldn't load the team");
      setTeam(await r.json());
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message ?? "Backend unreachable — is it running?" });
    } finally {
      setLoading(false);
    }
  }, [businessId, authedFetch]);

  useEffect(() => { load(); }, [load]);

  const myRole = team?.members.find((m) => m.user_id === userId)?.role;
  const isOwner = myRole === "owner";

  const invite = async () => {
    setBusy("invite");
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/team/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, role: "member" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Couldn't create the invite");
      setNewInviteUrl(d.invite_url);
      setCopied(false);
      load();
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const changeRole = async (memberId: string, role: "owner" | "member") => {
    setBusy(memberId);
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/team/${memberId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Couldn't change the role");
      load();
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const removeMember = async (memberId: string) => {
    setBusy(memberId);
    setNotice(null);
    try {
      const r = await authedFetch(`/api/v1/team/${memberId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Couldn't remove this member");
      load();
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!newInviteUrl) return;
    await navigator.clipboard.writeText(newInviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Reveal y={12} style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#241c15", display: "flex", alignItems: "center", gap: 10 }}>
            <Users size={24} color="#9c6b1f" /> Team
          </h1>
          <p style={{ color: "#8a7a64", marginTop: 4 }}>Who has access to this business, and what they can do.</p>
        </div>
        {isOwner && (
          <button className="btn-primary" onClick={invite} disabled={busy !== null}
            style={{ display: "flex", alignItems: "center", gap: 7, opacity: busy ? 0.6 : 1 }}>
            <UserPlus size={14} /> Invite member
          </button>
        )}
      </Reveal>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              marginBottom: 16, padding: "10px 14px", borderRadius: 10, fontSize: "0.85rem",
              color: notice.kind === "ok" ? "#2f8f52" : "#b23a2e",
              background: notice.kind === "ok" ? "rgba(47,143,82,0.08)" : "rgba(178,58,46,0.08)",
              border: `1px solid ${notice.kind === "ok" ? "rgba(47,143,82,0.24)" : "rgba(178,58,46,0.24)"}`,
            }}>
            {notice.text}
          </motion.div>
        )}
        {newInviteUrl && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              marginBottom: 16, padding: "12px 14px", borderRadius: 10,
              background: "rgba(184,134,46,0.08)", border: "1px solid rgba(184,134,46,0.24)",
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            }}>
            <span style={{ fontSize: "0.8rem", color: "#6b5d49" }}>Share this link — it expires in 7 days:</span>
            <code className="mono" style={{ flex: 1, minWidth: 200, fontSize: "0.78rem", color: "#9c6b1f", background: "rgba(184,134,46,0.08)", padding: "4px 8px", borderRadius: 6, overflowX: "auto" }}>
              {newInviteUrl}
            </code>
            <button className="btn-ghost" onClick={copyLink} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.78rem", padding: "6px 10px" }}>
              {copied ? <Check size={13} color="#2f8f52" /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => setNewInviteUrl(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8a7a64" }}>
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ color: "#8a7a64", padding: 40, textAlign: "center" }}>Loading team…</div>
      ) : (
        <>
          <Stagger style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
            {team?.members.map((m) => (
              <StaggerItem key={m.id}>
                <div className="glass-card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                    background: "linear-gradient(135deg, #b8862e, #a8541f)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.75rem", fontWeight: 700, color: "#ffffff",
                  }}>
                    {initials(m.full_name, m.email)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#241c15", display: "flex", alignItems: "center", gap: 8 }}>
                      {m.full_name || m.email || "Unknown"}
                      {m.user_id === userId && <span style={{ fontSize: "0.68rem", color: "#8a7a64", fontWeight: 400 }}>(you)</span>}
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#8a7a64" }}>{m.email}</div>
                  </div>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.7rem", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.04em",
                    color: m.role === "owner" ? "#b9791c" : "#6b5d49",
                    background: m.role === "owner" ? "rgba(185,121,28,0.14)" : "rgba(107,93,73,0.1)",
                    padding: "4px 10px", borderRadius: 999,
                  }}>
                    {m.role === "owner" && <Crown size={11} />} {m.role}
                  </span>
                  {isOwner && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn-ghost"
                        disabled={busy !== null}
                        onClick={() => changeRole(m.id, m.role === "owner" ? "member" : "owner")}
                        style={{ fontSize: "0.75rem", padding: "6px 10px", opacity: busy === m.id ? 0.6 : 1 }}>
                        {m.role === "owner" ? "Make member" : "Make owner"}
                      </button>
                      <button
                        disabled={busy !== null}
                        onClick={() => removeMember(m.id)}
                        title="Remove from business"
                        style={{
                          background: "none", border: "1px solid rgba(178,58,46,0.25)", borderRadius: 8,
                          padding: "6px 8px", cursor: "pointer", color: "#b23a2e", opacity: busy === m.id ? 0.6 : 1,
                        }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          {isOwner && team && team.pending_invites.length > 0 && (
            <Reveal>
              <h2 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#8a7a64", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Pending invites
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {team.pending_invites.map((inv) => (
                  <div key={inv.id} className="glass-card" style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 10, opacity: 0.85 }}>
                    <Clock size={14} color="#b9791c" />
                    <span style={{ fontSize: "0.82rem", color: "#6b5d49", flex: 1 }}>
                      Invite for a <b style={{ color: "#4a3d2c" }}>{inv.role}</b> — expires {new Date(inv.expires_at).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </>
      )}
    </div>
  );
}
