"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Mail, Lock, User, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Reveal, motion } from "@/components/motion/Primitives";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: fullName || email.split("@")[0] } },
        });
        if (err) throw err;
        if (!data.session) {
          setCheckEmail(true); // email confirmation required by project settings
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0f1e", padding: 24, position: "relative", overflow: "hidden",
    }}>
      <div className="orb" style={{ width: 480, height: 480, top: -160, left: "10%", background: "radial-gradient(circle, #6366f1, transparent 70%)" }} />
      <div className="orb" style={{ width: 420, height: 420, bottom: -160, right: "8%", background: "radial-gradient(circle, #22d3ee, transparent 70%)", animationDelay: "5s" }} />

      <Reveal style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400 }}>
        <div className="ring-card" style={{ padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, justifyContent: "center" }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #6366f1, #22d3ee)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
              boxShadow: "0 0 18px rgba(99,102,241,0.4)",
            }}>🤖</div>
            <span style={{ fontWeight: 700, color: "#f1f5f9" }}>AI FinanceOS</span>
          </div>

          {checkEmail ? (
            <div style={{ textAlign: "center", padding: "12px 4px" }}>
              <Mail size={30} color="#818cf8" style={{ marginBottom: 12 }} />
              <h2 style={{ color: "#f1f5f9", fontWeight: 700, marginBottom: 8 }}>Check your email</h2>
              <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.6 }}>
                We sent a confirmation link to <b style={{ color: "#e2e8f0" }}>{email}</b>. Confirm your
                address, then sign in.
              </p>
              <button className="btn-ghost" style={{ marginTop: 18 }} onClick={() => { setCheckEmail(false); setMode("signin"); }}>
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9", textAlign: "center", marginBottom: 4 }}>
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h1>
              <p style={{ color: "#64748b", fontSize: "0.85rem", textAlign: "center", marginBottom: 24 }}>
                {mode === "signin" ? "Sign in to your finance dashboard" : "Start automating your bookkeeping"}
              </p>

              <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {mode === "signup" && (
                  <InputField icon={User} type="text" placeholder="Full name" value={fullName} onChange={setFullName} />
                )}
                <InputField icon={Mail} type="email" placeholder="Email address" value={email} onChange={setEmail} required />
                <InputField icon={Lock} type="password" placeholder="Password" value={password} onChange={setPassword} required minLength={6} />

                {error && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    style={{ fontSize: "0.8rem", color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "8px 12px" }}>
                    {error}
                  </motion.div>
                )}

                <button type="submit" disabled={busy} className="btn-primary"
                  style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.7 : 1 }}>
                  {busy ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : (
                    <>{mode === "signin" ? "Sign in" : "Create account"} <ArrowRight size={15} /></>
                  )}
                </button>
              </form>

              <div style={{ textAlign: "center", marginTop: 18, fontSize: "0.83rem", color: "#64748b" }}>
                {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
                <button
                  onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
                  style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", fontWeight: 600, fontSize: "0.83rem" }}
                >
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: "0.78rem", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Sparkles size={12} /> Agentic finance for small business
        </div>
      </Reveal>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function InputField({
  icon: Icon, type, placeholder, value, onChange, required, minLength,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  type: string; placeholder: string; value: string; onChange: (v: string) => void;
  required?: boolean; minLength?: number;
}) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
        <Icon size={15} color="#64748b" />
      </span>
      <input
        type={type} placeholder={placeholder} value={value} required={required} minLength={minLength}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", background: "rgba(26,34,53,0.7)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, padding: "11px 14px 11px 36px", color: "#f1f5f9", fontSize: "0.9rem",
          outline: "none", fontFamily: "inherit",
        }}
      />
    </div>
  );
}
