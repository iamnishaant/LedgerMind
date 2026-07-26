# LedgerMind — Project Report

> An agentic financial operating system for small businesses: a virtual accountant, bookkeeper, analyst, and CFO in one platform.

**Document type:** Comprehensive project report (problem, rationale, significance, business model, system detail)
**Product:** LedgerMind (formerly "AI FinanceOS")
**Prepared:** 2026-07-23
**Status at time of writing:** 10 of 11 roadmap phases built and live-verified; 108 automated tests passing.

---

## 1. Executive summary

LedgerMind turns the messy, manual back-office of a small business into a self-driving system. A
user uploads a receipt — or connects their Gmail so receipts arrive automatically — and a chain of
AI agents reads it, books the expense to the right ledger category, checks it for fraud, tests it
against the business's GST input-tax-credit rules, and watches it against live budgets. On top of
that transactional layer sit business-level agents that forecast cash flow, answer plain-English
questions about the books, and generate a structured "CFO brief" of risks, opportunities, and
recommended actions.

The core design discipline that separates this from a generic "ChatGPT for finance" wrapper:
**every number is computed deterministically by SQL and Python; the large language model is used
only to classify and to explain, never to invent a figure.** That single rule is what makes the
output trustworthy enough to sit in an accounting workflow.

---

## 2. Problem statement

Small businesses — especially in India, the primary market — run their finances on a fragile stack
of WhatsApp photos of receipts, a shoebox of paper bills, a spreadsheet, and a part-time accountant
who reconciles everything weeks later. This produces four concrete, recurring failures:

1. **Bookkeeping is manual, slow, and error-prone.** Someone has to read each receipt, type the
   amount, guess the expense category, and enter it. This lags reality by days or weeks, so the
   owner never actually knows their current position.

2. **Tax credit is silently left on the table.** Under India's GST regime, businesses can reclaim
   input tax credit (ITC) on eligible purchases — but only if the invoice has a valid GSTIN, the
   right tax slab, and the category is eligible (food, entertainment, and some others are blocked).
   Manually tracking which of hundreds of receipts qualify is tedious, so recoverable money is
   simply missed.

3. **There is no early warning.** Budgets are overspent, cash runs short, and fraud or duplicate
   billing slips through — all discovered after the fact, in a monthly review, when it is too late
   to act.

4. **Real financial analysis is unaffordable.** A fractional CFO who could look at the numbers and
   say "your marketing budget is at risk and you have ₹1L of unclaimed tax credit" costs more than
   a small business can justify. So that analysis never happens.

The underlying problem is not a lack of data — the receipts exist. It is that turning that data
into **timely, trustworthy, and actionable** financial intelligence requires labor and expertise
that small businesses cannot afford at the moment they need it.

---

## 3. How and why we are building this

### 3.1 The core idea

LedgerMind is built as a team of specialized AI **agents**, each owning one job an accounting team
would normally split among people, orchestrated so that a single receipt flows through all of them
automatically. Instead of one monolithic model trying to do everything, each stage is narrow,
testable, and — critically — deterministic wherever money is involved.

### 3.2 The guiding principle: deterministic money, LLM for language

The single most important architectural decision is a strict division of labor:

- **SQL and Python compute every number** — totals, tax amounts, budget run-rates, forecast trends,
  fraud z-scores, ITC eligibility. These are exact, repeatable, and unit-tested.
- **The LLM only does language tasks** — reading text off a receipt image, classifying an expense
  into a category, and writing the human-readable narrative of the CFO brief.

This is *why* the system can be trusted in a financial context. An LLM asked "what's my total
spend?" can hallucinate a plausible-but-wrong number; LedgerMind never asks it to. The chat agent,
for example, doesn't guess — it calls real query tools against the database and reports what they
return.

### 3.3 The agent chain (per receipt)

```text
OCR → (human review if low confidence) → Accounting → Fraud → Budget Monitor
```

This runs as **one LangGraph graph** with a **durable Postgres checkpointer** and a
**human-in-the-loop breakpoint**. If OCR confidence is low, the graph *pauses at a checkpoint*,
waits for a human to confirm the extracted values, then resumes the same thread — and that paused
state now survives a full server restart (durability was verified live by tearing down the
connection and resuming correctly).

### 3.4 The business-level agents (on demand)

GST, Budgets, Forecasting, and the CFO brief are **aggregates** — they summarize the whole book, so
they run on page load rather than per receipt. Chat is a separate tool-calling agent that answers
questions by running real queries. Wiring these into the per-receipt chain would be wasteful and
semantically wrong (you don't regenerate an LLM CFO brief on every single upload), so they were
deliberately kept as independently-invoked agents.

### 3.5 Why this approach over the alternatives

- **Why agents, not one big prompt:** narrow agents are individually testable and can be
  deterministic. A monolithic prompt is neither.
- **Why a dedicated Python backend, not serverless edge functions:** the OCR engine (PaddleOCR) and
  the orchestrator (LangGraph) need to run natively; this was an explicitly resolved architecture
  decision.
- **Why provider-swappable LLMs:** the LLM layer can switch between NVIDIA NIM, Anthropic, and
  OpenAI via one config flag, so the project is never locked to a single vendor's pricing or
  availability.

---

## 4. Significance for the present time

Several things make this the right project to build *now*, not five years ago and not five years
from now:

- **LLMs just crossed the usefulness threshold for real bookkeeping.** Reliable zero-shot receipt
  reading and expense classification without training a bespoke model only became practical
  recently. LedgerMind needs **no training** — OCR is pretrained (PaddleOCR) and classification is
  zero-shot prompted. On a real, unseen test set of receipts it reached **100% amount accuracy and
  100% date accuracy** on the deterministic layer.

- **Agentic orchestration is now a mature pattern.** Durable, resumable, human-in-the-loop agent
  graphs (LangGraph with a Postgres checkpointer) are exactly what a *trustworthy* financial
  workflow needs — a paused low-confidence receipt that a human confirms and the system resumes,
  rather than a black box that either silently guesses or silently fails.

- **The "trust gap" is the whole opportunity.** The market is flooded with LLM wrappers that
  confidently produce wrong numbers. A system whose numbers are provably deterministic — where the
  LLM is fenced off from the money path — is differentiated precisely because it solves the problem
  that makes most AI-finance tools unusable in practice.

- **GST compliance is a live, high-value pain in the Indian SMB market.** Automatically surfacing
  recoverable input tax credit (in the current demo data set: ~₹1.07L recoverable vs ₹25K blocked
  vs 28 receipts missing a GSTIN) is concrete, immediate money back in the owner's pocket — not an
  abstract "insight."

- **Automation closes the loop.** With Gmail auto-ingest, receipts flow in without anyone
  remembering to upload them, which is the difference between a tool people *try* and a tool people
  *keep*.

---

## 5. Business scope and model

### 5.1 Target market

Primary: **small and medium businesses in India** that handle their own bookkeeping or use a
part-time accountant, and that care about GST input-tax-credit recovery. The GST intelligence is a
regionally-specific wedge; the bookkeeping, budgeting, forecasting, fraud, and CFO layers are
globally applicable and would carry an expansion into other markets.

### 5.2 The value proposition, per persona

| The business gets… | …instead of paying for |
|---|---|
| Automatic receipt capture + booking | Data-entry hours / a junior bookkeeper |
| GST ITC eligibility tracking | Missed, unrecovered tax credit |
| Live budgets with overspend projection | A monthly surprise |
| Fraud / duplicate-invoice flags | Undetected leakage |
| Plain-English chat over the books | Waiting for the accountant to pull a number |
| A structured monthly CFO brief | A fractional CFO retainer |

In one line: **replace a fractional finance team with a subscription.**

### 5.3 Business model

A **B2B SaaS subscription**, naturally tiered around the phases already built:

- **Starter** — expense tracking, AI bookkeeping, GST intelligence (the everyday
  capture-and-comply layer).
- **Growth** — adds budgets, forecasting, AI chat, and the CFO brief (the analysis layer), plus
  Gmail automation.
- **Enterprise** — teams & roles, approval workflows, an audit-log viewer, API keys, and ERP/CSV
  export (multi-user, governance, and integration).

The Enterprise tier is not aspirational — teams & roles, approvals, the audit-log viewer, API keys,
and export are **built**. Because usage cost is dominated by LLM calls, and the money path is
deterministic (no LLM), per-account cost is low and predictable; the LLM is only invoked for
classification, chat, and the CFO narrative, and the two LLM endpoints are already rate-limited.

### 5.4 Moat / defensibility

1. **The deterministic-money discipline** is a trust advantage that's easy to state and hard for a
   thin-wrapper competitor to retrofit.
2. **GST/ITC domain logic** encodes real regulatory rules (blocked categories, valid slabs, GSTIN
   requirements) — a compliance surface that deepens over time.
3. **A planned correction-feedback loop** (see §7) makes categorization learn per-business from user
   corrections — a live, per-tenant alternative to fine-tuning that turns accumulated usage into a
   switching cost.
4. **Provider-swappable LLM layer** avoids single-vendor lock-in on cost and availability.

---

## 6. The system in detail

### 6.1 High-level architecture

```text
User → Next.js 16 Dashboard (App Router, Motion, dark theme)
     → Supabase (Auth, PostgreSQL, Storage, Row-Level Security)
     → Python FastAPI backend (/api/v1)
     → LangGraph Orchestrator (durable Postgres checkpointer + human-in-the-loop)
```

### 6.2 Technology stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Motion (animation), Recharts, Lucide |
| Backend | Python 3.11, FastAPI, LangGraph, PaddleOCR, Pydantic, slowapi (rate limiting) |
| Database | Supabase / PostgreSQL, pgvector, Storage, Row-Level Security |
| AI | LangGraph tool-calling; provider-swappable LLM (Anthropic / OpenAI / NVIDIA NIM) |
| Orchestration | LangGraph durable Postgres checkpointer, human-in-the-loop breakpoints |
| Automations | Gmail OAuth ingest, Inngest scheduled polling |

Monorepo layout: `frontend/` (Next.js), `backend/` (FastAPI + agents), `supabase/`
(`schema.sql` + incremental `migrations/`), `docs/` (roadmap, audit, status, design).

### 6.3 The agents, one by one

**OCR agent** — reads the receipt image. PaddleOCR extracts text; deterministic regex owns
currency, dates, and totals. Real bugs found and fixed during the first end-to-end test include a
PIL-vs-numpy image-type mismatch, a parser that mistook "cash tendered" for the total, line-split
totals, and a date regex that failed on undelimited timestamps. Result after fixes: 100% amount and
date accuracy on real SROIE receipts.

**OCR verifier** — an independent vision LLM re-reads the image and cross-checks amount/date/vendor
against the deterministic extraction. On disagreement it escalates to human review; it **never
overwrites values** — it is a consensus gate only. In testing it caught 2/2 injected wrong-amount
cases that confidence-threshold gating alone missed, proving the cross-check adds real safety.

**Accounting agent** — books the expense and classifies its category via the LLM. Computes GST rate
and amount inline (deterministically). A silent template-escaping bug here once dropped all receipt
data from the prompt and was fixed.

**Fraud agent** (Phase 9) — deterministic, no LLM. Scores each booked expense on four signals:
vendor-amount outlier (z-score vs that vendor's own history), category-amount outlier, same-day
same-vendor split-invoice pattern, and new-vendor-with-a-large-amount. Writes a `fraud_risk` level
and reasons; surfaced on the Expenses page as a "review"/"high risk" badge.

**Budget monitor** (Phase 9) — deterministic. Checks whether the just-booked expense pushed a
matching budget into `at_risk`/`over`, reusing the same run-rate math as the Budgets API (no
duplicated logic). Both new nodes are **error-isolated**: a bug in fraud or budget scoring can never
roll back an already-booked expense — it only logs and continues.

**GST agent** — deterministic ITC eligibility: blocked categories (Food & Dining, Medical &
Health), valid tax slabs {5, 12, 18, 28}, requires a GSTIN. Powers the GST dashboard's
recoverable / blocked / missing-GSTIN breakdown.

**Budgets** — CRUD plus deterministic run-rate overspend projection (`on_track` / `at_risk` /
`over`), shown as animated progress bars.

**Forecasting** — numpy linear trend fit over *complete* months only (the current, partial month is
explicitly excluded from the fit), rendered as a Recharts projection. Verified against 204 real
expense rows.

**AI CFO** — assembles this-month expenses + budget states + forecast + GST into one JSON payload,
hands it to the LLM, and requires a **strict JSON** response (`headline`, `risks[]`,
`opportunities[]`, `actions[]`). The frontend renders real cards from that structure, not parsed
prose. Every figure in a live-generated brief traced back to real precomputed numbers — no
hallucinated values.

**AI Chat** — a tool-calling agent with query tools over Supabase. Asked for "top 3 vendors," it
calls the `top_vendors` tool and answers with real figures rather than guessing.

### 6.4 Automation (Phase 8)

A `Connector` protocol with a Gmail connector (plain httpx against the Gmail REST API, `read-only`
scope) filters to receipt-like attachments (images/PDFs ≥ 10KB) and feeds them into the *same*
shared ingest pipeline as manual upload. Safeguards, all live-verified:

- **Token security:** OAuth tokens are Fernet-encrypted at rest; the OAuth `state` is itself a
  Fernet-encrypted, self-authenticating token that doubles as CSRF defense.
- **Dedup ledger:** a `processed_external_items` table ensures a given email attachment is only
  ever ingested once — proven by running the sync repeatedly and confirming re-runs ingest nothing.
- **Hard batch cap:** at most 20 items per run, to protect against a burst backlog overwhelming the
  OCR/LLM stages.
- **Full audit trail:** every item and every run writes rows to `agent_runs`.

Inngest is wired for a 15-minute scheduled poll sharing the exact same `run_sync()` as the manual
"Sync now" button. The one outstanding step in the entire roadmap is a human clicking through the
real Google OAuth consent screen.

### 6.5 Enterprise layer (Phase 10)

- **Audit-log viewer** — a read-only page over the `agent_runs` data every agent has written since
  Phase 1 (filterable, paginated, with a summary of totals and success rate).
- **Teams & roles** — a business can have multiple users. New `business_members` / `business_invites`
  tables, an owner auto-added by a `SECURITY DEFINER` trigger, and RLS rewritten across all
  previously owner-scoped tables around a shared `is_business_member()` helper — applied and
  verified live. Invites are shareable token links (no email infra required).
- **Approvals** — an expense the Fraud agent scores `high` risk requires an owner's sign-off before
  it's settled (builds directly on Fraud + Teams).
- **API keys + ERP export** — programmatic, business-scoped CSV export for connecting an external
  accounting tool. Only a SHA-256 hash of each key is stored; key auth is scoped to just the export
  endpoint.

### 6.6 Security, reliability, and quality

- **Real authorization, not cosmetic:** every business-scoped endpoint verifies the bearer token and
  checks business membership server-side (`ensure_owns_business()`), so the frontend cannot simply
  claim a `business_id`. A garbage token is rejected; a valid session gets `403` for a business it
  doesn't own.
- **Row-Level Security** on all tables.
- **Rate limiting** (slowapi) on the two LLM-calling endpoints (`/chat`, `/cfo/brief`).
- **Durable state:** the LangGraph checkpointer runs on real Postgres (session-mode pooler), so
  human-in-the-loop state survives a restart. Fixing this surfaced and fixed a genuine
  Windows-specific psycopg async-event-loop bug that would otherwise have silently degraded to
  in-memory forever.
- **Hardening:** server-side 10MB upload cap enforced in the shared ingest path; four previously
  silent `except` blocks now log real tracebacks; a fragile `.single()` query replaced with an
  explicit check; an invalid-date bug (`{month}-32`) that would 500 the Expenses page for any
  31-day month fixed at the root with a shared date helper.
- **Automated tests (previously zero):** **108 backend pytest tests**, live against a real dev
  Supabase project with no mocking — covering auth/RLS, GST rules, the exact OCR parsing bugs (pinned
  as permanent regressions), forecast math (checked against an independently computed fit),
  automation dedup/cap, checkpointer durability, and every Phase 10 endpoint. Plus **9 frontend
  Vitest tests** for the forecast chart logic. A GitHub Actions workflow is written (DB-backed tests
  self-skip cleanly without secrets).

### 6.7 Current status snapshot

| Phase | Feature | Status |
|---|---|---|
| 0 | Auth | Done |
| 1 | Expense tracking MVP | Done |
| 2 | AI bookkeeper (categorization) | Done |
| 3 | GST intelligence (ITC eligibility) | Done |
| 4 | AI chat (tool-calling over the books) | Done |
| 5 | Budget intelligence | Done |
| 6 | Forecasting | Done |
| 7 | AI CFO brief | Done |
| 8 | Automations (Gmail auto-ingest) | Code complete; OAuth click-through pending |
| 9 | Multi-agent / fraud | Done |
| 10 | Enterprise (teams, approvals, audit log, API keys, export) | Done |

**Known open items:** the Phase 8 Gmail OAuth click-through (needs a human browser); Inngest keys
blank (scheduled poll wired but inert — manual "Sync now" works); first GitHub Actions run
unconfirmed; a duplicate `framer-motion`/`motion` dependency to clean up; no production deployment
yet (verified in local dev only).

---

## 7. Roadmap / what's next

1. **Close Phase 8** — complete the real Gmail OAuth click-through and confirm a real receipt
   email flows end-to-end through the full Fraud / Budget-Monitor / Approvals chain. The last open
   item in the entire roadmap.
2. **Correction-feedback loop** — make categorization learn per-business from user corrections: a
   live, per-tenant alternative to model fine-tuning, and a source of switching-cost moat. Design in
   `docs/CORRECTION_FEEDBACK_LOOP.md`.
3. **Chat latency** — move to a fast hosted model and stream responses (SSE), since the current
   free-tier LLM is slow under load.
4. **Production deployment** — the system has only been run and verified in local dev; there is no
   hosted deployment or CI/CD pipeline yet.

---

## 8. Reference documents

- `docs/PROJECT_STATUS.md` — current snapshot (source for §6.7).
- `docs/AUDIT_REPORT.md` — phase-by-phase completion detail and verification method.
- `docs/BUILD_ROADMAP.md` — the full phase plan.
- `docs/STRENGTHENING_ROADMAP.md` — the security/reliability/testing hardening plan.
- `docs/CORRECTION_FEEDBACK_LOOP.md` — design for per-business learning from corrections.
- `README.md` — quickstart, architecture, and tech stack.
