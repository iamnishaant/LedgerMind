"use client";
/**
 * AI Chat — Phase 4.
 * Talks to POST /api/v1/chat/stream, which runs a tool-calling agent over your
 * real Supabase expense data (grounded answers, no hallucinated numbers).
 *
 * UX (latency-optimized): the assistant bubble appears the instant you hit send
 * with an "AI is thinking…" indicator, then streams tokens in place. Common
 * questions answer from a pre-fetched snapshot in a single model call, so the
 * first token arrives fast. You can Stop a generation mid-stream (partial text
 * is kept) or Retry a failed one. Conversation state is preserved throughout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, Wrench, BrainCircuit, Square, RotateCw, Zap, Plus, Trash2, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Reveal } from "@/components/motion/Primitives";
import { useBusiness } from "@/lib/business-context";

type MsgStatus = "thinking" | "streaming" | "done" | "error";

interface Timings {
  snapshot_ms: number;
  first_token_ms: number | null;
  total_ms: number;
  rounds: number;
  used_snapshot?: boolean;
  used_tools?: boolean;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  tools_used?: string[];
  status?: MsgStatus;
  toolStatus?: string;
  timings?: Timings;
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
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

const toolStatusLabel: Record<string, string> = {
  get_monthly_summary: "Reading this month's summary…",
  top_vendors: "Ranking your vendors…",
  category_spend: "Adding up that category…",
  recent_expenses: "Pulling recent expenses…",
};

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export default function ChatPage() {
  const { businessId, authedFetch } = useBusiness();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastUserMsg, setLastUserMsg] = useState<string | null>(null);
  // null = a brand-new, unsaved chat. The thread is only created server-side
  // once the first message is sent, so opening the page and leaving doesn't
  // litter the list with empty conversations.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const r = await authedFetch(`/api/v1/chat/sessions?business_id=${businessId}`);
      if (!r.ok) return;
      const d = await r.json();
      setSessions(d.sessions ?? []);
    } catch { /* backend offline — the rail just stays empty */ }
  }, [businessId, authedFetch]);

  // Every visit opens on a fresh chat; past threads are one click away in the rail.
  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  const openThread = useCallback(async (id: string) => {
    if (busy) return;
    setLoadingThread(true);
    try {
      const r = await authedFetch(`/api/v1/chat/history?business_id=${businessId}&session_id=${id}`);
      if (!r.ok) throw new Error("Couldn't open that chat");
      const d = await r.json();
      setMessages((d.messages ?? []).map((m: { role: Msg["role"]; content: string }) => (
        { role: m.role, content: m.content, status: "done" as MsgStatus }
      )));
      setSessionId(id);
    } catch {
      setMessages([]);
    } finally {
      setLoadingThread(false);
    }
  }, [businessId, authedFetch, busy]);

  const newChat = useCallback(() => {
    if (busy) abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    setInput("");
    setLastUserMsg(null);
  }, [busy]);

  const deleteThread = useCallback(async (id: string) => {
    try {
      const r = await authedFetch(`/api/v1/chat/sessions/${id}`, { method: "DELETE" });
      if (!r.ok) return;
      setSessions(prev => prev.filter(s => s.id !== id));
      // Deleting the thread you're reading drops you into a fresh one.
      if (id === sessionId) newChat();
    } catch { /* leave the row in place if the delete didn't land */ }
  }, [authedFetch, sessionId, newChat]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Patch the last (assistant) message in place.
  const patchLast = (fn: (m: Msg) => Msg) =>
    setMessages(prev => prev.map((m, i) => (i === prev.length - 1 ? fn(m) : m)));

  // Stream a reply into the trailing assistant placeholder (which must already exist).
  const streamInto = async (q: string) => {
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const r = await authedFetch(`/api/v1/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // session_id null → the backend opens a new thread and tells us its id
        // in the first `session` event.
        body: JSON.stringify({ business_id: businessId, message: q, session_id: sessionId }),
        signal: controller.signal,
      });
      if (!r.ok || !r.body) throw new Error(`stream failed (${r.status})`);

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const block of events) {
          const line = block.split("\n").find(l => l.startsWith("data:"));
          if (!line) continue;
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === "session") {
            // Adopt the thread the backend just opened (or confirmed), and show
            // it in the rail immediately rather than after a round-trip.
            setSessionId(ev.id);
            setSessions(prev => prev.some(s => s.id === ev.id)
              ? prev.map(s => (s.id === ev.id ? { ...s, title: ev.title } : s))
              : [{ id: ev.id, title: ev.title, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]);
          } else if (ev.type === "token") {
            patchLast(m => ({ ...m, content: m.content + ev.text, status: "streaming", toolStatus: undefined }));
          } else if (ev.type === "tool") {
            patchLast(m => ({ ...m, tools_used: [...(m.tools_used ?? []), ev.name], toolStatus: toolStatusLabel[ev.name] ?? "Looking at your books…" }));
          } else if (ev.type === "done") {
            patchLast(m => ({ ...m, content: ev.answer, tools_used: ev.tools_used, status: "done", timings: ev.timings, toolStatus: undefined }));
          } else if (ev.type === "error") {
            throw new Error(ev.detail ?? "stream error");
          }
        }
      }
      // If the stream ended without an explicit done (e.g. proxy cut), settle it.
      patchLast(m => (m.status === "done" || m.status === "error" ? m : { ...m, status: "done", toolStatus: undefined }));
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err.name === "AbortError") {
        patchLast(m => ({ ...m, status: "done", content: m.content || "⏹ Stopped.", toolStatus: undefined }));
      } else {
        patchLast(m => ({ ...m, status: "error", content: m.content || `⚠️ ${err.message ?? "Couldn't reach the assistant."} (is the backend running?)`, toolStatus: undefined }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const send = (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setLastUserMsg(q);
    setMessages(prev => [
      ...prev,
      { role: "user", content: q },
      { role: "assistant", content: "", status: "thinking", tools_used: [] },
    ]);
    streamInto(q);
  };

  const stop = () => abortRef.current?.abort();

  const retry = () => {
    if (!lastUserMsg || busy) return;
    // Replace the trailing (error) assistant bubble with a fresh placeholder.
    setMessages(prev => {
      const copy = [...prev];
      copy[copy.length - 1] = { role: "assistant", content: "", status: "thinking", tools_used: [] };
      return copy;
    });
    streamInto(lastUserMsg);
  };

  const empty = messages.length === 0;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", height: "calc(100vh - 64px)", display: "flex", gap: 20 }}>
      {/* Thread rail */}
      <aside aria-label="Your chats" style={{
        width: 232, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, paddingTop: 4,
      }}>
        <button onClick={newChat} className="btn-primary"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" }}>
          <Plus size={16} /> New chat
        </button>

        <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-dim)", padding: "6px 4px 0" }}>
          Recent
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {sessions.length === 0 ? (
            <p style={{ fontSize: "0.78rem", color: "var(--color-text-dim)", padding: "4px 6px", lineHeight: 1.5 }}>
              Your conversations will appear here once you ask something.
            </p>
          ) : sessions.map(s => {
            const active = s.id === sessionId;
            return (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 4, borderRadius: 9, paddingRight: 4,
                background: active ? "rgba(184,134,46,0.14)" : "transparent",
              }}>
                <button
                  onClick={() => openThread(s.id)}
                  disabled={busy}
                  title={s.title}
                  aria-current={active ? "true" : undefined}
                  style={{
                    flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
                    background: "none", border: "none", cursor: busy ? "default" : "pointer",
                    padding: "8px 8px", textAlign: "left", fontFamily: "inherit",
                    fontSize: "0.8rem", color: active ? "var(--color-primary-glow)" : "var(--color-text-muted)",
                  }}
                >
                  <MessageSquare size={13} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                </button>
                <button
                  onClick={() => deleteThread(s.id)}
                  aria-label={`Delete chat: ${s.title}`}
                  title="Delete chat"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-dim)", padding: 4, display: "flex", borderRadius: 6 }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--color-danger)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-dim)")}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Conversation */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <Reveal y={12} style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 10 }}>
          <BrainCircuit size={24} color="var(--color-primary-glow)" /> AI Chat
        </h1>
        <p style={{ color: "var(--color-text-dim)", marginTop: 4 }}>Ask about your finances — answers are computed from your real expense data.</p>
      </Reveal>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, padding: "8px 4px" }}>
        {loadingThread && (
          <p style={{ margin: "auto", fontSize: "0.85rem", color: "var(--color-text-dim)" }}>Opening chat…</p>
        )}
        {empty && !loadingThread && (
          <div style={{ margin: "auto", textAlign: "center", maxWidth: 520 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px", background: "linear-gradient(135deg, var(--color-primary), var(--color-warning))", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px -4px rgba(184,134,46,0.4)" }}>
              <Sparkles size={26} color="#fff" />
            </div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: 6, color: "var(--color-text)" }}>Ask me anything about your books</h2>
            <p style={{ color: "var(--color-text-dim)", fontSize: "0.88rem", marginBottom: 20 }}>I run real queries over your expenses — no made-up numbers.</p>
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
          {messages.map((m, i) => {
            const isThinking = m.role === "assistant" && m.status === "thinking" && !m.content;
            return (
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
                  background: m.role === "user" ? "linear-gradient(135deg, var(--color-primary), var(--color-warning))" : "var(--color-surface)",
                  border: m.role === "user" ? "none" : "1px solid var(--color-stroke)",
                  color: m.role === "user" ? "#ffffff" : "var(--color-text)",
                  borderBottomRightRadius: m.role === "user" ? 4 : 16,
                  borderBottomLeftRadius: m.role === "assistant" ? 4 : 16,
                }}>
                  {/* Thinking / tool status while streaming */}
                  {isThinking ? (
                    <ThinkingRow label={m.toolStatus ?? "AI is thinking…"} />
                  ) : (
                    <>
                      {m.content}
                      {m.role === "assistant" && busy && m.toolStatus && i === messages.length - 1 && (
                        <div style={{ marginTop: 8 }}><ThinkingRow label={m.toolStatus} /></div>
                      )}
                    </>
                  )}

                  {/* Tool chips */}
                  {m.tools_used && m.tools_used.length > 0 && m.status === "done" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--color-stroke)" }}>
                      {Array.from(new Set(m.tools_used)).map(t => (
                        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.68rem", color: "var(--color-success)", background: "rgba(79,114,104,0.15)", padding: "2px 8px", borderRadius: 999 }}>
                          <Wrench size={11} /> {prettyTool[t] ?? t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Subtle latency readout */}
                  {m.role === "assistant" && m.status === "done" && m.timings && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: "0.66rem", color: "var(--color-text-dim)" }}>
                      <Zap size={10} />
                      {m.timings.first_token_ms != null && <span>{secs(m.timings.first_token_ms)} to first token</span>}
                      <span>· {secs(m.timings.total_ms)} total</span>
                      {m.timings.used_snapshot && !m.timings.used_tools && <span>· 1 call</span>}
                    </div>
                  )}

                  {/* Retry on error */}
                  {m.role === "assistant" && m.status === "error" && (
                    <button onClick={retry} disabled={busy} className="btn-ghost"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: "0.75rem", fontWeight: 600 }}>
                      <RotateCw size={12} /> Retry
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
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
            background: "var(--color-surface)", border: "1px solid var(--color-stroke)",
            borderRadius: 12, padding: "13px 16px", color: "var(--color-text)", fontSize: "0.9rem",
            outline: "none", fontFamily: "inherit", lineHeight: 1.5,
          }}
        />
        {busy ? (
          <button onClick={stop} className="btn-ghost" title="Stop generating"
            style={{ padding: "12px 16px", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--color-danger)" }}>
            <Square size={15} fill="var(--color-danger)" /> Stop
          </button>
        ) : (
          <button onClick={() => send(input)} disabled={!input.trim()} className="btn-primary"
            style={{ padding: "12px 16px", opacity: !input.trim() ? 0.5 : 1, cursor: !input.trim() ? "default" : "pointer" }}>
            <Send size={17} />
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

function ThinkingRow({ label }: { label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ display: "inline-flex", gap: 4 }}>
        {[0, 1, 2].map(d => (
          <motion.span key={d}
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
            style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-primary-glow)" }} />
        ))}
      </span>
      <span style={{ color: "var(--color-text-dim)", fontSize: "0.8rem" }}>{label}</span>
    </span>
  );
}
