# AI FinanceOS — Project Status

**As of: 2026-07-21**
**Latest commit:** `d9aba51` — "Harden backend security/reliability, add automated test suite" (pushed to `origin/main`)

This is a snapshot, not a roadmap or audit — see `AUDIT_REPORT.md` (phase-by-phase completion
detail, 2026-07-14) and `STRENGTHENING_ROADMAP.md` (the hardening plan this status reflects
progress against) for the deeper documents this summarizes.

---

## Rollup

**8 of 11 roadmap items (Phases 0–7) are built and live-verified. Phase 8 is code-complete with
one manual step outstanding. Phases 9–10 are not started.** Backend security/reliability hardening
(Week 1) and a real automated test suite (Week 1–2) — the two biggest cross-cutting gaps — are now
both done.

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
| 9 — Multi-Agent / Fraud | 🔴 Not started |
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

---

## What's still open

1. **Phase 8's one remaining manual step** — no Gmail account has actually been connected yet
   (`connected_accounts` is empty). Needs a human to click through Google's OAuth consent screen;
   real `GOOGLE_CLIENT_ID`/`SECRET` are already configured.
2. **`INNGEST_EVENT_KEY`/`SIGNING_KEY` still blank** — the 15-minute Gmail poll is wired but inert;
   only the manual "Sync now" button is live today.
3. **First real GitHub Actions run unconfirmed** — the workflow is written and pushed but hasn't
   been watched executing; first run may need one round of adjustment.
4. **Phase 9** (Fraud agent, real per-receipt agent chain) and **Phase 10** (teams/roles, approvals,
   an audit-log UI over the already-rich `agent_runs` data, API keys, ERP export) — not started.
5. Minor, noticed in passing: `frontend/package.json` lists both `framer-motion` and `motion` —
   duplicates the animation runtime; a leftover from before this project standardized on `motion`.

## Recommended next step
Either close out Phase 8 (connect a real Gmail account, confirm a real receipt syncs end-to-end) or
move on to Phase 9 (Fraud agent + the unified multi-agent chain) — both are reasonable next moves;
everything built so far now sits on a hardened, tested foundation rather than untested code.
