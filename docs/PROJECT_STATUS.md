# AI FinanceOS — Project Status

**As of: 2026-07-21**
**Latest commit:** `97369c6` — "Add Phase 9: Fraud agent + Budget Monitor, wired into the per-receipt chain" (pushed to `origin/main`)

This is a snapshot, not a roadmap or audit — see `AUDIT_REPORT.md` (phase-by-phase completion
detail, 2026-07-14) and `STRENGTHENING_ROADMAP.md` (the hardening plan this status reflects
progress against) for the deeper documents this summarizes.

---

## Rollup

**9 of 11 roadmap items (Phases 0–7, 9) are built and live-verified. Phase 8 is code-complete with
one manual step outstanding. Phase 10 is not started.** Backend security/reliability hardening
(Week 1), a real automated test suite (Week 1–2), and Phase 9 (Fraud agent + the chained per-receipt
pipeline) are now all done.

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
| 10 — Enterprise | 🔴 Not started |

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
- 7 new DB-backed tests (`test_fraud_agent.py`), each isolating one signal. **Full suite: 47/47
  passing.**

---

## What's still open

1. **Phase 8's one remaining manual step** — no Gmail account has actually been connected yet
   (`connected_accounts` is empty). Needs a human to click through Google's OAuth consent screen;
   real `GOOGLE_CLIENT_ID`/`SECRET` are already configured.
2. **`INNGEST_EVENT_KEY`/`SIGNING_KEY` still blank** — the 15-minute Gmail poll is wired but inert;
   only the manual "Sync now" button is live today.
3. **First real GitHub Actions run unconfirmed** — the workflow is written and pushed but hasn't
   been watched executing; first run may need one round of adjustment.
4. **Phase 10** (teams/roles, approvals, an audit-log UI over the already-rich `agent_runs` data,
   API keys, ERP export) — not started.
5. Minor, noticed in passing: `frontend/package.json` lists both `framer-motion` and `motion` —
   duplicates the animation runtime; a leftover from before this project standardized on `motion`.

## Recommended next step
Close out Phase 8 (connect a real Gmail account, confirm a real receipt syncs end-to-end through the
now-full Fraud/Budget-Monitor chain) — the only phase-completion work left before Phase 10
(Enterprise), the last unstarted roadmap item.
