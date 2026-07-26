"use client";
/**
 * Root global error boundary (App Router). This is the last line of defense —
 * it catches errors thrown by the ROOT layout itself, so it must render its own
 * <html>/<body> and cannot rely on globals.css or any provider being mounted.
 * Everything here is inlined and self-contained on purpose.
 */
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Fatal UI error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f8f2e7" }}>
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            maxWidth: 440, width: "100%", padding: 32, textAlign: "center",
            background: "#ffffff", border: "1px solid rgba(36,28,21,0.09)", borderRadius: 16,
          }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#241c15", margin: "0 0 8px" }}>
              The app hit a fatal error
            </h1>
            <p style={{ color: "#6b5d49", fontSize: "0.9rem", margin: "0 0 22px", lineHeight: 1.5 }}>
              Please reload the page. If it keeps happening, contact support.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "10px 22px", borderRadius: 10, border: "1px solid rgba(184,134,46,0.5)",
                background: "rgba(184,134,46,0.14)", color: "#9c6b1f", fontWeight: 600,
                fontSize: "0.9rem", cursor: "pointer",
              }}>
              Reload
            </button>
            {error?.digest && (
              <p style={{ color: "#9c8c74", fontSize: "0.7rem", marginTop: 16 }}>Ref: {error.digest}</p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
