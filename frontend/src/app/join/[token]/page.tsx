"use client";
/**
 * Invite acceptance — Phase 10 (Teams & Roles).
 * Standalone route (outside /dashboard's layout, which requires the user to
 * already belong to a business) so a first-time invitee landing here with
 * zero memberships doesn't get bounced to /onboarding before they can accept.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Reveal } from "@/components/motion/Primitives";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type State = "checking" | "signed_out" | "accepting" | "done" | "error";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (!cancelled) setState("signed_out"); return; }

      if (!cancelled) setState("accepting");
      try {
        const r = await fetch(`${API_URL}/api/v1/team/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ token }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail ?? "Couldn't accept this invite");
        if (!cancelled) setState("done");
      } catch (e: any) {
        if (!cancelled) { setError(e.message); setState("error"); }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (state !== "done") return;
    const t = setTimeout(() => { router.push("/dashboard"); router.refresh(); }, 1800);
    return () => clearTimeout(t);
  }, [state, router]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0f1e", padding: 24, position: "relative", overflow: "hidden",
    }}>
      <div className="orb" style={{ width: 460, height: 460, top: -160, right: "6%", background: "radial-gradient(circle, #6366f1, transparent 70%)" }} />
      <Reveal style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>
        <div className="ring-card" style={{ padding: 32, textAlign: "center" }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: "rgba(99,102,241,0.14)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px",
          }}>
            <Users size={22} color="#818cf8" />
          </div>

          {(state === "checking" || state === "accepting") && (
            <>
              <Loader2 size={26} color="#818cf8" style={{ animation: "spin 1s linear infinite", marginBottom: 12 }} />
              <p style={{ color: "#94a3b8", fontSize: "0.88rem" }}>
                {state === "checking" ? "Checking your session…" : "Joining the team…"}
              </p>
            </>
          )}

          {state === "signed_out" && (
            <>
              <h1 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>Log in to accept this invite</h1>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: 20, lineHeight: 1.6 }}>
                Sign in (or create an account), then come back to this link to join the team.
              </p>
              <a href="/login" className="btn-primary" style={{ display: "inline-block", textDecoration: "none" }}>
                Go to login
              </a>
            </>
          )}

          {state === "done" && (
            <>
              <CheckCircle2 size={30} color="#10b981" style={{ marginBottom: 12 }} />
              <h1 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>You're in</h1>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Taking you to the dashboard…</p>
            </>
          )}

          {state === "error" && (
            <>
              <XCircle size={30} color="#f87171" style={{ marginBottom: 12 }} />
              <h1 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>Couldn't join</h1>
              <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: 20 }}>{error}</p>
              <a href="/dashboard" className="btn-ghost" style={{ display: "inline-block", textDecoration: "none" }}>
                Go to dashboard
              </a>
            </>
          )}
        </div>
      </Reveal>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
