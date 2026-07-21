# AI FinanceOS — Project Status

**As of: 2026-07-21**
**Latest commit:** `ae2dab4` — "Add Phase 10: API keys + ERP export (final Phase 10 piece)" (pushed to `origin/main`)

This is a snapshot, not a roadmap or audit — see `AUDIT_REPORT.md` (phase-by-phase completion
detail, 2026-07-14) and `STRENGTHENING_ROADMAP.md` (the hardening plan this status reflects
progress against) for the deeper documents this summarizes.

---

## Rollup

**10 of 11 roadmap items (Phases 0–7, 9, 10) are built and live-verified. Phase 8 is code-complete
with one manual step outstanding — the only thing standing between this project and every planned
phase being done.** Backend security/reliability hardening (Week 1), a real automated test suite
(Week 1–2), Phase 9 (Fraud agent + the chained per-receipt pipeline), and Phase 10 (Enterprise: audit
log, teams & roles, approvals, API keys + export) are all done.

| Phase | Status |
|---|---|
| 0 — Auth | 🟢 Done |
| 1 — Expense Tracking MVP | 🟢 Done |
| 2 — AI Bookkeeper | 🟢 Done |
| 3 — GST Intelligence | 🟢 Done |
| 4 — AI Chat | 🟢 Done |
| 5 — Budget Intelligence | 🟢 Done |
| 6 — Forecasting | 🟢 Done |
| 7 — AI CFO | 🟢 Done |
| 8 — Automations (Gmail) | 🟡 Code done; real OAuth click-through still pending (needs a human browser) |
| 9 — Multi-Agent / Fraud | 🟢 Done |
| 10 — Enterprise | 🟢 Done |

---

## What changed since the last audit (2026-07-14 → today)

### Security & reliability hardening
- Rate limiting (`slowapi`) on `/chat` and `/cfo/brief` — the two LLM-calling endpoints that had
  zero cost/abuse protection.
- The 4 previously-silent `except Exception:` blocks (accounting/CFO/OCR agents) now log a real
  exception with traceback instead of failing invisibly.
- Server-side 10MB upload cap, enforced once in the shared `core/ingest.py` path (covers manual
  upload and Gmail uniformly) — the frontend claimed this limit but nothing enforced it.
- `orchestrator.py`'s fragile `.single()` call (throws on 0 or 2+ matching rows) replaced with an
  explicit check.
- **`DATABASE_URL` is now set to a real Supabase Postgres connection — the LangGraph checkpointer
  is genuinely durable**, not the in-memory fallback. Verified live: state survives a full
  connection teardown (simulating a server restart) and resumes correctly.

### A real bug this hardening pass found and fixed
Wiring up `DATABASE_URL` surfaced that **psycopg's async mode cannot run under Windows' default
event loop**, and the checkpointer's own error handling would have silently kept falling back to
in-memory forever with just a `print()` — invisible durability failure, on this exact machine,
until this pass. Fixed at the root (`WindowsSelectorEventLoopPolicy` in `main.py`) and the fallback
now logs a real traceback.

### Automated testing (previously: zero)
- **40 backend pytest tests** (`backend/tests/`), all live-verified against the real dev Supabase
  project — no mocking. Covers GST ITC rules, the exact OCR parsing bugs fixed earlier this project
  (pinned as permanent regressions), auth ownership checks, forecast trend math (checked against an
  independently computed fit, not the agent's own formula), automation dedup/batch-cap logic, and
  checkpointer durability.
- **9 frontend Vitest tests** for the Forecasts page's chart-data logic, extracted into a pure,
  testable function (Vitest didn't exist in this project before this pass).
- `ocr_agent.py`'s PaddleOCR import was made lazy so none of the above need the heavy OCR
  dependency chain installed — real OCR-against-images testing remains the separate, slower
  `scripts/verify_ocr.py`.
- `.github/workflows/backend-tests.yml` — written, YAML-validated, **not yet observed actually
  running** (needs a GitHub Actions run to confirm; DB-backed tests will self-skip until
  `SUPABASE_URL`/`SERVICE_KEY`/`ANON_KEY` are added as repo secrets).

### Phase 9 — Multi-Agent / Fraud (new)
The orchestrator graph is now `OCR → (human review?) → Accounting → Fraud → Budget Monitor`, not
just the old 2-node `OCR → Accounting`. Two new deterministic agents (no LLM — same discipline as
every other agent in this project):
- **`fraud_agent.py`** — scores every booked expense against 4 signals: vendor amount outlier
  (z-score vs that vendor's own history), category amount outlier, same-day/same-vendor split-invoice
  pattern, and new-vendor-with-a-large-amount. Writes to `fraud_risk` (schema column existed since
  Phase 1, unused until now) + `metadata.fraud_reasons`. Surfaced on the Expenses page as a
  "review"/"high risk" badge.
- **`budget_monitor.py`** — checks whether the just-booked expense pushed a matching budget into
  `at_risk`/`over`, reusing `budgets.py`'s existing `_status_for` math (no duplicated logic).
- **Forecast and CFO were deliberately NOT chained in per-receipt** — both are business-level
  aggregates meant for on-demand page load (the CFO brief is an LLM call; running it on every single
  receipt upload would be wasteful and semantically wrong). They remain independent, page-triggered
  agents, unchanged.
- Both new nodes are error-isolated: a bug in fraud scoring or budget checking can never roll back or
  fail an already-booked expense — they only log and continue.
- 7 new DB-backed tests (`test_fraud_agent.py`) + 6 more (`test_budget_monitor.py`, added right after
  to close a test-parity gap — the first version of this phase shipped fraud_agent fully tested and
  budget_monitor with zero tests). **Note on scope:** this is Phase 9 done against a deliberately
  revised definition, not the original doc's literal 7-node `OCR → Accounting → Fraud → GST → Budget
  → Forecast → CFO` chain — GST eligibility was already computed inline in `accounting_agent.py`
  since Phase 3 (not re-added as a separate node), and Forecast/CFO were intentionally left as
  page-triggered aggregates rather than per-receipt steps (see above). That interpretation was
  flagged before building and not overridden.

### Phase 10 — Enterprise (all 4 pieces, now complete)
Four commits, each independently tested and verified before the next began:

1. **Audit Log viewer** — read-only dashboard page over `agent_runs` (data every agent has written
   since Phase 1, nothing previously surfaced it). `GET /api/v1/audit` (filterable, paginated) +
   `/audit/summary` (totals, success rate, breakdowns). No new tables, no LLM. 6 tests.
2. **Teams & Roles** — the architecturally significant piece: a business can now have more than one
   user. New `business_members`/`business_invites` tables, a `SECURITY DEFINER` trigger that
   auto-adds the owner as a member on business creation, and a rewrite of RLS across all 7
   previously `owner_id`-scoped tables around a shared `is_business_member()` helper — **applied
   live against the dev Supabase project and verified there**, not just written. `ensure_owns_business()`
   now checks membership (any role) instead of literal `owner_id`; a real bug this surfaced and fixed:
   `dashboard/layout.tsx` resolved "which businesses does this user belong to" via `owner_id` only,
   which would have wrongly bounced an invited member to onboarding. Invite flow is a shareable
   token link (`/join/[token]`) — no email-sending infra in this project. 19 tests.
3. **Approvals workflow** — builds directly on Fraud (Phase 9) and Teams & Roles: an expense the
   Fraud agent scores `'high'` risk now needs an owner's sign-off (`expenses.approval_status`)
   before it's settled. Deliberately narrower than "over a threshold OR flagged" — only the fraud
   signal gates approval, no separate dollar-threshold settings surface. 10 tests.
4. **API keys + ERP export** — programmatic, business-scoped CSV export for connecting an external
   accounting tool, plus a one-click download in the dashboard. Only a SHA-256 hash of a key is ever
   stored. API-key auth is deliberately scoped to the one endpoint that needs it (export), not
   bolted onto the whole API. 20 tests.

**A real, currently-live bug found and fixed along the way:** writing the export endpoint's month
filter surfaced that `expenses.py`'s existing `f"{month}-32"` trick is an invalid date literal for
every month (max real day is 31) — Postgres rejected it outright for any 31-day month, **including
July, the current month**, meaning filtering the live Expenses page to this month would 500 right
now. Fixed at the root with a shared `app/core/dates.py:month_bounds()` helper, not just patched in
the new code; pinned with 6 regression tests.

Phase 10 total: 61 new backend tests. **Full suite: 108/108 passing.**

---

## What's still open

1. **Phase 8's one remaining manual step** — no Gmail account has actually been connected yet
   (`connected_accounts` is empty). Needs a human to click through Google's OAuth consent screen;
   real `GOOGLE_CLIENT_ID`/`SECRET` are already configured. This is now the only unfinished item
   across all 11 roadmap phases.
2. **`INNGEST_EVENT_KEY`/`SIGNING_KEY` still blank** — the 15-minute Gmail poll is wired but inert;
   only the manual "Sync now" button is live today.
3. **First real GitHub Actions run unconfirmed** — the workflow is written and pushed but hasn't
   been watched executing; first run may need one round of adjustment.
4. Minor, noticed in passing: `frontend/package.json` lists both `framer-motion` and `motion` —
   duplicates the animation runtime; a leftover from before this project standardized on `motion`.
5. Migrations `0004`–`0006` were applied directly against the live dev Supabase project via psycopg
   during this session (each in its own transaction, each verified live afterward) — worth knowing
   if this project is ever cloned into a fresh Supabase project: `schema.sql` already reflects the
   end state, so a fresh install just needs `schema.sql` run once; the `migrations/` files are the
   incremental history for anyone applying them to an existing pre-Phase-10 database instead.

## Recommended next step
Close out Phase 8 — connect a real Gmail account, confirm a real receipt syncs end-to-end through
the full Fraud/Budget-Monitor/Approvals chain now in place. It's the last open item in the entire
roadmap.
