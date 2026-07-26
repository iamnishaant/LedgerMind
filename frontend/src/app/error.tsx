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
      padding: 24, background: "#0b0f1a",
    }}>
      <div className="glass-card" style={{ maxWidth: 460, width: "100%", padding: 32, textAlign: "center" }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, margin: "0 auto 18px",
          background: "rgba(248,113,113,0.14)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AlertTriangle size={24} color="#f87171" />
        </div>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
          Something went wrong
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: 22, lineHeight: 1.5 }}>
          An unexpected error interrupted this page. You can try again — your data is safe.
        </p>
        <button
          onClick={reset}
          style={{
            padding: "10px 22px", borderRadius: 10, border: "1px solid rgba(99,102,241,0.5)",
            background: "rgba(99,102,241,0.16)", color: "#818cf8", fontWeight: 600,
            fontSize: "0.9rem", cursor: "pointer",
          }}>
          Try again
        </button>
        {error?.digest && (
          <p style={{ color: "#475569", fontSize: "0.7rem", marginTop: 16 }}>Ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
