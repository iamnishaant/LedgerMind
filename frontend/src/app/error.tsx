"use client";
/**
 * App-wide error boundary (App Router). Catches any error thrown while
 * rendering a route segment below the root layout — every page under /,
 * /dashboard, /login, /onboarding, etc. Replaces the old per-page-only
 * try/catch, so an unexpected throw shows a recoverable screen instead of a
 * blank white page.
 */
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface it for debugging / future error-reporting integration.
    console.error("Unhandled UI error:", error);
  }, [error]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, background: "#f8f2e7",
    }}>
      <div className="glass-card" style={{ maxWidth: 460, width: "100%", padding: 32, textAlign: "center" }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, margin: "0 auto 18px",
          background: "rgba(178,58,46,0.12)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AlertTriangle size={24} color="#b23a2e" />
        </div>
        <h1 className="serif" style={{ fontSize: "1.3rem", fontWeight: 500, color: "#241c15", marginBottom: 8 }}>
          Something went wrong
        </h1>
        <p style={{ color: "#6b5d49", fontSize: "0.9rem", marginBottom: 22, lineHeight: 1.5 }}>
          An unexpected error interrupted this page. You can try again — your data is safe.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "10px 22px", borderRadius: 10, border: "1px solid rgba(184,134,46,0.5)",
            background: "rgba(184,134,46,0.14)", color: "#9c6b1f", fontWeight: 600,
            fontSize: "0.9rem", cursor: "pointer",
          }}>
          Try again
        </button>
        {error?.digest && (
          <p style={{ color: "#9c8c74", fontSize: "0.7rem", marginTop: 16 }}>Ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
