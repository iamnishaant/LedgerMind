"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Reveal } from "@/components/motion/Primitives";

const CURRENCIES = ["INR", "USD", "EUR", "GBP"];

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [gstNumber, setGstNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the user is not authenticated, bounce to login (the proxy also guards this).
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
    });
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      // RLS policy "Business owner" permits this insert (owner_id = auth.uid()).
      const { error: err } = await supabase.from("businesses").insert({
        owner_id: user.id, name: name.trim(), currency,
        gst_number: gstNumber.trim() || null, country: "IN",
      });
      if (err) throw err;

      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Couldn't create your business. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0f1e", padding: 24, position: "relative", overflow: "hidden",
    }}>
      <div className="orb" style={{ width: 460, height: 460, top: -160, right: "6%", background: "radial-gradient(circle, #6366f1, transparent 70%)" }} />

      <Reveal style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 440 }}>
        <div className="ring-card" style={{ padding: 32 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(99,102,241,0.14)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <Building2 size={22} color="#818cf8" />
          </div>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>Set up your business</h1>
          <p style={{ color: "#64748b", fontSize: "0.85rem", marginBottom: 24 }}>
            One workspace for your receipts, expenses, and reports. You can add more businesses later.
          </p>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Business name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Consulting" required style={inputStyle} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
              <Field label="Currency">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
                  {CURRENCIES.map((c) => <option key={c} value={c} style={{ background: "#1a2235" }}>{c}</option>)}
                </select>
              </Field>
              <Field label="GST number (optional)">
                <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="29ABCDE1234F1Z5" style={inputStyle} />
              </Field>
            </div>

            {error && (
              <div style={{ fontSize: "0.8rem", color: "#f87171", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "8px 12px" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary"
              style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.7 : 1 }}>
              {busy ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : (
                <>Create business <ArrowRight size={15} /></>
              )}
            </button>
          </form>
        </div>
      </Reveal>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(26,34,53,0.7)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10, padding: "10px 12px", color: "#f1f5f9", fontSize: "0.88rem",
  outline: "none", width: "100%", fontFamily: "inherit",
};
