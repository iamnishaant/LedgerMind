# AI FinanceOS — Project Audit Report (Revision 2)

**Date:** 2026-07-14
**Supersedes:** the 2026-07-12 audit (Phases 0, 3–8 have all shipped since then)
**Scope:** Full repo (`frontend/`, `backend/`, `supabase/`, `docs/`) against the 10-phase roadmap.
**Method:** Verified against the live filesystem, live database, and live running services at audit
time — not against memory of prior sessions. Every claim below traces to a compile, an import, a
live HTTP call, or a direct database query run during this audit.

## 1. Rollup

| Phase | Feature | Status |
|---|---|---|
| 0 | Auth / prerequisites | 🟢 Done, live-verified |
| 1 | Expense Tracking MVP | 🟢 Done, live-verified |
| 2 | AI Bookkeeper | 🟢 Done, live-verified |
| 3 | GST Intelligence | 🟢 Done, live-verified |
| 4 | AI Chat (RAG) | 🟢 Done, live-verified |
| 5 | Budget Intelligence | 🟢 Done, live-verified |
| 6 | Forecasting | 🟢 Done, live-verified |
| 7 | AI CFO | 🟢 Done, live-verified |
| 8 | Automation & Integrations | 🟡 Code done + logic live-verified; **real Gmail OAuth click-through not yet completed** |
| 9 | Multi-Agent Collaboration (Fraud) | 🔴 Not started |
| 10 | Enterprise | 🔴 Not started |

**11 items tracked** (the original 10-phase roadmap, phases 1–10, plus the Phase 0 prerequisite
work that was added during the build). **8 are fully done and live-verified. 1 (Phase 8) is
code-complete with its hardest logic proven live, but has one manual step only a human can do.
2 are not started.**

The **bigger gap is not features — it's the absence of an automated, repeatable test suite.**
Everything below has been verified, but by hand-run scripts, not a CI-enforceable suite. See §5.

---

## 2. Completed & verified, phase by phase

### Phase 0 — Auth
- Supabase email/password auth; `src/proxy.ts` (Next.js 16 naming) guards `/dashboard/*` +
  `/onboarding`; `BusinessProvider`/`useBusiness()` hydrated server-side, exposes `authedFetch`
  with the live access token.
- **Authorization is real, not cosmetic**: every business-scoped endpoint calls
  `ensure_owns_business()` server-side — the frontend can't just claim a `business_id`.
- **Live-verified this session**: created a real user via the admin API, confirmed the
  auto-profile trigger fired, confirmed a garbage bearer token is rejected with `AuthApiError`,
  confirmed a valid session correctly returns `403` for a business it doesn't own.

### Phase 1 — Expense Tracking MVP
- Upload → Storage → OCR (PaddleOCR + deterministic regex) → expense record → dashboard.
- **Live-verified against real, unseen data**: 6 SROIE receipts, ground-truth labeled.
  **100% amount accuracy, 100% date accuracy** after fixing 4 real bugs found by this exact
  testing (PIL→numpy mismatch, two parser traps — line-split totals and "cash tendered" being
  mistaken for the total, and a date regex that failed on undelimited timestamps).

### Phase 2 — AI Bookkeeper
- Categorization (LLM), duplicate detection (±3-day window), OCR-date normalization.
- Two real bugs fixed this project: an escaped-brace template bug that silently dropped all
  receipt data from the prompt, and a missing LangGraph checkpointer that meant "approve" could
  never actually resume a paused pipeline.
- **Gap still open**: no "learning from corrections" — categorization is stateless per call.

### Phase 3 — GST Intelligence
- `gst_agent.py`: deterministic ITC eligibility (blocked categories, valid rate slabs, requires a
  GSTIN) — no LLM in the money path. `/dashboard/gst` shows recoverable vs. blocked vs.
  missing-GSTIN follow-ups.
- **Live-verified**: migration applied, `gst_number` column confirmed to exist,
  `build_gst_summary()` runs correctly against real data (₹1.07L recoverable / ₹25K blocked / 28
  missing-GSTIN in the current seed set).

### Phase 4 — AI Chat
- Tool-calling agent (4 tools) querying Supabase directly — grounded, not hallucinated.
- **Live-verified**: asked "top 3 vendors," model correctly called `top_vendors` and answered with
  the real figures.

### Phase 5 — Budget Intelligence
- CRUD + deterministic run-rate overspend projection (`on_track`/`at_risk`/`over`).
- **Live-verified**: Software budget correctly flagged 90.8% used → `at_risk` against real seeded
  data.

### Phase 6 — Forecasting
- Linear trend over *complete* months only (current month explicitly excluded from the fit).
- **Live-verified**: correct rising trend and 3-month projection from 204 real expense rows.

### Phase 7 — AI CFO
- Synthesizes this-month expenses + budget states + forecast + GST into a structured JSON brief
  (headline/risks/opportunities/actions) — strict JSON contract, not parsed markdown.
- **Live-verified**: every cited figure in the generated brief traced back to real precomputed
  numbers (correctly flagged the 2 `at_risk` budgets as risks, the 3 `on_track` ones as
  opportunities, the 28 missing GSTINs as a compliance risk). One transient `getaddrinfo failed`
  was hit and confirmed to be a DNS blip, not a code bug (retried, succeeded).

### Phase 8 — Automations (Gmail auto-ingest)
- Shared `ingest_receipt()`/`run_ingest_pipeline()` core so manual upload and automation share one
  pipeline. `Connector` protocol + `GmailConnector` (plain httpx, `gmail.readonly` scope). Fernet
  token encryption. OAuth `state` is self-authenticating (Fernet-encrypted, doubles as CSRF
  defense). Inngest wired for the first time in this project (15-min cron), sharing the exact same
  `run_sync()` as the manual "Sync now" button.
- **Live-verified this session** (real HTTP + real DB, throwaway QA business, cleaned up after):
  - **409 on double-connect**: real HTTP round trip — first connect → `200` with a Google consent
    URL; second connect while active → clean `409 "Gmail is already connected... disconnect
    first"`, no stack trace.
  - **Dedup ledger**: 4 real `run_sync()` calls against a stubbed connector — 25 new items → 20
    ingested (capped); same 25 again → 20 correctly skipped, 5 ingested; same 25 a third time → 0
    ingested; one genuinely new item → only that 1 processed. This is the exact "does dedup key on
    the right thing" scenario that fails silently if done wrong.
  - **Batch cap**: confirmed `capped: True` at exactly 20/25 in one run, `capped: False` once the
    backlog clears — the uncapped-burst risk flagged during planning is closed.
  - **`agent_runs` inspected directly** (not the UI): 26 per-item rows + 4 run-level summaries, all
    `agent_name='gmail_connector'`, `source:'automation'`, `status='completed'`.
  - **What could NOT be tested by the agent**: the actual Google OAuth consent screen and a real
    Gmail email with a real attachment — both require a human browser + a real Google account.
    Real `GOOGLE_CLIENT_ID`/`SECRET` are now in `.env` and `google_oauth_configured: true` is
    confirmed live; the click-through itself is the one remaining manual step.
- **Test-harness finding, not a product bug**: one QA cleanup call printed success but didn't
  immediately remove the test business; a retry succeeded and no orphaned data remains. Logged
  here because it's a legitimate "don't just trust the printed success message" lesson, consistent
  with why this audit re-queries the database directly rather than trusting prior output.

---

## 3. Not started

### Phase 9 — Multi-Agent Collaboration
- No Fraud agent (schema has `fraud_risk` column, unused). The orchestrator is still a 2-node
  graph — `OCR → (human review) → Accounting` — not the full `→ Fraud → GST → Budget → Forecast →
  CFO` chain the original report envisioned. GST/Budget/Forecast/CFO all exist today as
  **independently invoked** agents (called on-demand from their own pages/APIs), not as stages
  wired into one graph run per receipt.

### Phase 10 — Enterprise
- No teams/roles (each business has exactly one owner), no approvals workflow, no audit-log
  viewer UI (the `agent_runs` table is rich and correct — every phase above writes real audit
  entries to it — but nothing in the frontend surfaces it as a dedicated page), no public API
  keys, no ERP export.

---

## 4. Cross-cutting operational gaps

- **`DATABASE_URL` is blank** → the LangGraph checkpointer runs on the in-memory fallback, not the
  durable Postgres one. Human-in-the-loop state does not survive a backend restart. This has been
  true since Phase 1 and is still true today.
- **`INNGEST_EVENT_KEY`/`SIGNING_KEY` are blank** → the 15-minute Gmail poll is wired but does not
  actually fire on a schedule; only the manual "Sync now" path is live today. Needs
  `npx inngest-cli dev` or Inngest Cloud to activate real background polling.
- **NVIDIA free tier reliability**: functional but not fully dependable — at least one transient
  connection failure observed this session (self-resolved on retry), and response latency is
  variable (a 6-receipt OCR verification run took ~60 minutes at one point due to queueing). Fine
  for development; a production deployment should budget for this or use a paid tier.
- **No production deployment** — everything has been run and verified in local dev only
  (`uvicorn --reload`, `npm run dev`). No Vercel project, no production `uvicorn` config, no CI/CD.
- **No global frontend error boundary** — only per-page try/catch.

---

## 5. Testing — the honest state (you asked specifically)

**What's genuinely been verified, and how:**

| Area | Verification method | Repeatable? |
|---|---|---|
| OCR pipeline (Phase 1) | `backend/scripts/verify_ocr.py` scored against real, ground-truth-labeled SROIE receipts | ✅ Yes — committed script, rerunnable |
| Auth (Phase 0) | Ad-hoc scripts: real signup, token rejection, ownership check | ⚠️ Scripts were in a scratchpad, not committed |
| GST/Budgets/Forecasts/CFO (3,5,6,7) | Ad-hoc scripts against live Supabase + live NVIDIA | ⚠️ Not committed to the repo |
| Automations (Phase 8) | Ad-hoc script: real HTTP for the 409, real `run_sync()` calls with a stubbed connector for dedup/cap | ⚠️ Not committed to the repo |
| Frontend | `tsc --noEmit` + `next build` after every change | ✅ Yes, cheap and fast, but only catches type/compile errors — zero behavioral coverage |

**What does NOT exist:**
- **No `pytest` suite.** Every backend verification this project has done was a one-off script,
  written fresh, usually deleted or left in a temp scratchpad. None of it runs on `git push`. None
  of it would catch a regression introduced next week.
- **No `jest`/`vitest`/React Testing Library.** Zero frontend unit or component tests.
- **No end-to-end test** (Playwright/Cypress) driving the actual browser through
  login → upload → categorize → budget → CFO brief.
- **No CI pipeline** — nothing runs any of the above automatically, ever, on any commit.

**Why this matters more than any single missing feature**: right now, "verified" means "a human
(or an agent) ran a script by hand on this specific date." The very next code change — even a
one-line one — has zero automatic protection. Two concrete near-misses this session illustrate
the risk: the `gst_number` schema mismatch (Phase 3) and the PIL→numpy PaddleOCR bug (Phase 1)
both shipped silently and were only caught because someone happened to run the *first-ever*
end-to-end test. A committed test suite turns "happened to test it once" into "can't regress it
silently."

**Recommended minimum, in priority order:**
1. Promote the best ad-hoc scripts from this session into `backend/tests/` as real `pytest` files
   (auth ownership checks, GST ITC rules, dedup/cap logic — all pure-logic or DB-backed, cheap to
   run, no LLM cost).
2. A `pytest` marker or separate suite for the handful of tests that need a live LLM call
   (chat tool-calling, CFO brief), run less frequently (not on every commit).
3. Wire whichever of the above into CI (even just "run on push" is a large step up from zero).
4. Frontend: at minimum, component tests for the money-sensitive displays (Budgets progress math,
   Forecast chart data shaping) — these are pure functions today and cheap to test.

---

## 6. Recommended order for what's next

1. **Complete the Phase 8 manual step** — click through the real Google OAuth consent screen,
   send a real receipt email, confirm it appears correctly. This is the last "0%→100% verified"
   gap in an otherwise-done phase.
2. **Stand up a minimal `pytest` suite** from §5 — highest leverage-per-hour of anything on this
   list; every future phase becomes safer to build on top of.
3. **Phase 9** — add the Fraud agent and wire OCR→Accounting→Fraud→GST→Budget→Forecast→CFO into
   one actual graph run, rather than independently-invoked agents.
4. **`DATABASE_URL`** — point at real Postgres so HITL state survives a restart; this has been a
   known gap since Phase 1 and gets more important as more of the app depends on durable state.
5. **Phase 10** — teams/roles, approvals, an audit-log viewer over the already-rich `agent_runs`
   data, API keys, ERP export.
