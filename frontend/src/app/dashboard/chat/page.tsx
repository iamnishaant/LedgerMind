"use client";
/**
 * AI Chat — Phase 4.
 * Talks to POST /api/v1/chat, which runs a tool-calling agent over your real
 * Supabase expense data (grounded answers, no hallucinated numbers).
 */
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Wrench, BrainCircuit } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

interface Msg {
  role: "user" | "assistant";
  content: string;
  tools_used?: string[];
}

const SUGGESTIONS = [
  "What did I spend on Software & Subscriptions this month?",
  "Who are my top 5 vendors?",
  "How much GST can I recover this month?",
  "Summarize my spending for this month.",
];

const prettyTool: Record<string, string> = {
  get_monthly_summary: "monthly summary",
  top_vendors: "top vendors",
  category_spend: "category spend",
  recent_expenses: "recent expenses",
};

export default function ChatPage() {
  const { businessId, authedFetch } = useBusiness();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    (async () => {
      try {
        const r = await authedFetch(`/api/v1/chat/history?business_id=${businessId}`);
        if (!r.ok) return;
        const d = await r.json();
        setMessages((d.messages ?? []).map((m: any) => ({ role: m.role, content: m.content })));
      } catch { /* backend offline — start empty */ }
    })();
  }, [businessId, authedFetch]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: q }]);
    setBusy(true);
    try {
      const r = await authedFetch(`/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, message: q }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail ?? "Chat failed");
      setMessages(prev => [...prev, { role: "assistant", content: d.answer, tools_used: d.tools_used }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${e.message ?? "Couldn't reach the assistant."} (is the backend running?)` }]);
    } finally {
      setBusy(false);
    }
  };

  const empty = messages.length === 0;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", height: "calc(100vh - 64px)", display: "flex", flexDirection: "column" }}>
      <Reveal y={12} style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
          <BrainCircuit size={24} color="#818cf8" /> AI Chat
        </h1>
        <p style={{ color: "#64748b", marginTop: 4 }}>Ask about your finances — answers are computed from your real expense data.</p>
      </Reveal>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, padding: "8px 4px" }}>
        {empty && (
          <div style={{ margin: "auto", textAlign: "center", maxWidth: 520 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px", background: "linear-gradient(135deg, #6366f1, #22d3ee)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 30px rgba(99,102,241,0.4)" }}>
              <Sparkles size={26} color="#fff" />
            </div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: 6 }}>Ask me anything about your books</h2>
            <p style={{ color: "#64748b", fontSize: "0.88rem", marginBottom: 20 }}>I run real queries over your expenses — no made-up numbers.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} className="btn-ghost" style={{ fontSize: "0.82rem", fontWeight: 500, textAlign: "left" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}
            >
              <div style={{
                maxWidth: "78%", padding: "12px 16px", borderRadius: 16, fontSize: "0.92rem", lineHeight: 1.55,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                background: m.role === "user" ? "linear-gradient(135deg, #6366f1, #4f46e5)" : "rgba(26,34,53,0.7)",
                border: m.role === "user" ? "none" : "1px solid rgba(255,255,255,0.08)",
                color: "#f1f5f9",
                borderBottomRightRadius: m.role === "user" ? 4 : 16,
                borderBottomLeftRadius: m.role === "assistant" ? 4 : 16,
              }}>
                {m.content}
                {m.tools_used && m.tools_used.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {Array.from(new Set(m.tools_used)).map(t => (
                      <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.68rem", color: "#22d3ee", background: "rgba(34,211,238,0.1)", padding: "2px 8px", borderRadius: 999 }}>
                        <Wrench size={11} /> {prettyTool[t] ?? t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {busy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "14px 18px", borderRadius: 16, borderBottomLeftRadius: 4, background: "rgba(26,34,53,0.7)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 6, alignItems: "center" }}>
              {[0, 1, 2].map(d => (
                <motion.span key={d}
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                  transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                  style={{ width: 7, height: 7, borderRadius: "50%", background: "#818cf8" }} />
              ))}
              <span style={{ color: "#64748b", fontSize: "0.78rem", marginLeft: 6 }}>querying your books…</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Composer */}
      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask about spending, vendors, GST, budgets…"
          rows={1}
          style={{
            flex: 1, resize: "none", maxHeight: 120,
            background: "rgba(26,34,53,0.7)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, padding: "13px 16px", color: "#f1f5f9", fontSize: "0.9rem",
            outline: "none", fontFamily: "inherit", lineHeight: 1.5,
          }}
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()} className="btn-primary"
          style={{ padding: "12px 16px", opacity: busy || !input.trim() ? 0.5 : 1, cursor: busy || !input.trim() ? "default" : "pointer" }}>
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}
