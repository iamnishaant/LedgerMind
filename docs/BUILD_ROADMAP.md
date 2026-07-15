# AI FinanceOS — Build Roadmap (Phases 4–10)

A concrete, code-level plan to turn the **locked sidebar items** (AI Chat, Budgets,
Forecasts, CFO Agent, Automations) into real, working features — built on the
existing stack, not rewritten.

## Where we are today (built ✅)

| Layer | Built |
|---|---|
| Data | Supabase schema — `profiles, businesses, receipts, expenses, budgets, chat_messages (pgvector), agent_runs` + RLS |
| Pipeline | FastAPI + LangGraph orchestrator: **OCR → (human review) → Accounting → Expenses**, durable checkpointer |
| LLM | Provider-switchable `app/core/llm.py` — currently **NVIDIA `meta/llama-3.3-70b-instruct`** |
| UI | Landing page, Dashboard, Receipts upload, Expenses — all Framer Motion |

The nav locks anything `phase > 3` ([Sidebar.tsx](../frontend/src/components/Sidebar.tsx)). Each phase below
**unlocks one item** by shipping its page + backend.

## Guiding principles (keep these every phase)

1. **Deterministic numbers, LLM for reasoning only.** Money/totals/forecasts come from
   SQL + Python math; the NVIDIA model explains, classifies, and advises — it never
   invents figures (architecture review §8.1).
2. **Reuse the patterns already here** — one agent module in `app/agents/`, one router in
   `app/api/v1/`, one page in `app/dashboard/`, animated with the `motion/Primitives`.
3. **Every new page is unlocked in [Sidebar.tsx](../frontend/src/components/Sidebar.tsx)** by removing its phase from the lock rule.
4. **Persist agent work to `agent_runs`** for the audit trail.

---

## Phase 0 — Prerequisites (do first, ~2–3 days)

Not a nav item, but everything below assumes these.

- **Real Supabase auth** — replace the hardcoded `NEXT_PUBLIC_DEMO_*` IDs with a login
  (`@supabase/ssr`, `src/lib/supabase.ts` already scaffolds the client). Add a `/login`
  page + middleware; derive `business_id` from the session. *Unblocks multi-user + RLS.*
- **Streaming helper** — a shared SSE/`ReadableStream` util so Chat & CFO can stream tokens.
- **Seed more data** — a script that inserts ~60 days of sample expenses so Budgets and
  Forecasts have something to compute against.

---

## Phase 4 — AI Chat (RAG over your finances)  →  unlocks **AI Chat**

**Goal:** ask "what did I spend on software last month?" and get a grounded answer.

- **Approach:** tool-calling, *not* vector search (more accurate for structured finance).
  The chat agent gets typed tools that hit Supabase:
  `get_monthly_summary`, `list_top_vendors`, `category_spend`, `find_expenses(filter)`.
  (Vector/pgvector RAG comes later for unstructured document Q&A.)
- **Backend:**
  - `app/agents/chat_agent.py` — LangGraph tool-calling loop over the NVIDIA model
    (llama-3.3-70b supports OpenAI-style function calling via NIM).
  - `app/api/v1/chat.py` — `POST /chat` (streams tokens), persists turns to `chat_messages`.
- **Frontend:** `app/dashboard/chat/page.tsx` — message bubbles, streaming, history from
  `chat_messages`, Framer Motion enter animations + typing indicator.
- **Depends on:** expenses data (Phase 0 seed).
- **Done when:** a question returns a correct number that matches the Expenses page, and the
  conversation persists across reloads.
- **Est:** ~1 week.

## Phase 5 — Budget Intelligence  →  unlocks **Budgets**

**Goal:** set budgets per category/period; see live progress + overspend warnings.

- **Backend:**
  - `app/api/v1/budgets.py` — CRUD on the existing `budgets` table.
  - `app/agents/budget_agent.py` — joins `budgets` vs actual `expenses`, computes % used,
    and a **deterministic overspend projection** (run-rate to period end). LLM writes the
    one-line "you'll exceed Marketing by ~₹4k" nudge.
- **Frontend:** `app/dashboard/budgets/page.tsx` — create/edit budgets, animated progress
  bars, at-risk badges (reuse the dashboard card + `AnimatedNumber` patterns).
- **Depends on:** expenses data.
- **Done when:** creating a budget immediately shows real spend against it.
- **Est:** ~4–5 days.

## Phase 6 — Forecasting  →  unlocks **Forecasts**

**Goal:** project cash flow / spend, burn rate, and runway.

- **Backend:**
  - `app/agents/forecast_agent.py` — **deterministic** time-series over historical
    expenses (moving average + linear trend; optional Holt-Winters for seasonality via
    `statsmodels`). Returns projected series + burn rate + runway months.
  - `app/api/v1/forecasts.py` — `GET /forecasts?business_id=…`.
- **Frontend:** `app/dashboard/forecasts/page.tsx` — projected vs actual line chart
  (Recharts), runway/burn stat tiles, confidence band.
- **Depends on:** ≥30 days of expense history (Phase 0 seed).
- **Done when:** the projection line continues the real trend and updates as data grows.
- **Est:** ~1 week.

## Phase 7 — AI CFO  →  unlocks **CFO Agent**

**Goal:** a narrative advisor that reasons over budgets + forecasts + expenses.

- **Backend:**
  - `app/agents/cfo_agent.py` — gathers computed metrics from Phases 4–6 (no raw math in
    the LLM), then the NVIDIA 70B produces prioritized recommendations (cost cuts, hiring
    headroom, risks) with citations to the numbers.
  - `app/api/v1/cfo.py` — `POST /cfo/brief` (streams the analysis).
- **Frontend:** `app/dashboard/cfo/page.tsx` — advisor cards, "ask the CFO" box, risk flags.
- **Depends on:** Phases 4, 5, 6 (it consumes their outputs).
- **Done when:** a brief references your actual top category and projected runway.
- **Est:** ~1 week.

## Phase 8 — Automation & Integrations  →  unlocks **Automations**

**Goal:** auto-ingest receipts from external sources instead of manual upload.

- **Backend:**
  - OAuth connectors (start with **Gmail** — attachments → receipt pipeline), then Drive /
    Dropbox / WhatsApp Business / Outlook.
  - Scheduled polling / webhooks via **Inngest** (already a dependency) → drop new files
    straight into the existing `/receipts/upload` → orchestrator flow.
- **Frontend:** `app/dashboard/automations/page.tsx` — connect buttons, per-source sync
  status, last-synced timestamps.
- **Depends on:** the Phase 1 pipeline (reused as-is).
- **Est:** ~2 weeks (OAuth + one connector; more per source).

---

## Phases 9–10 (from the report, after the nav is complete)

- **Phase 9 — Multi-Agent Collaboration:** add **Fraud** + **GST** agents and wire the full
  chain into one LangGraph graph: `OCR → Accounting → Fraud → GST → Budget → Forecast → CFO`.
  Schema already has `fraud_risk`, `gst_*`, `agent_tags` columns.
- **Phase 10 — Enterprise:** teams & roles (tighten RLS for multi-user), approvals UI,
  audit-log viewer over `agent_runs`, API keys, ERP export.

---

## Suggested build order & sequencing

```
Phase 0 (auth + seed + streaming)
   └─ Phase 4  AI Chat        ← most demoable; validates NVIDIA tool-calling
        └─ Phase 5 Budgets
             └─ Phase 6 Forecasts
                  └─ Phase 7 CFO   (needs 4–6)
                       └─ Phase 8 Automations
                            └─ Phase 9 → Phase 10
```

**Cross-cutting (do alongside):** input validation on every new endpoint, error/empty
states on every new page, and a smoke test per agent. Update
[AI_FinanceOS_Final_Report.docx](../AI_FinanceOS_Final_Report.docx) "Implementation Status"
as each phase lands.

## Per-phase definition of done (checklist)

- [ ] Agent module in `app/agents/` + unit-tested pure logic
- [ ] Router in `app/api/v1/` wired in `main.py`, visible in `/docs`
- [ ] Page in `app/dashboard/` with Framer Motion + loading/empty/error states
- [ ] Item **unlocked** in `Sidebar.tsx`
- [ ] Writes to `agent_runs`; numbers reconcile with the Expenses page
