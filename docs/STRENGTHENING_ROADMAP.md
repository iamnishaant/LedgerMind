# AI FinanceOS — Strengthening Roadmap

**Date:** 2026-07-14
**Lens:** not "is it built" (see `AUDIT_REPORT.md` for that) — this is "would it hold up," looking at
security, reliability, observability, and code quality across the whole codebase.
**Method:** fresh grep/read sweep of the live repo this session — secrets hygiene, RLS coverage,
error handling, logging, rate limiting, validation, accessibility — not a re-read of prior audits.

---

## 1. What's genuinely good here

Worth naming plainly, because a "what needs fixing" list on its own undersells a codebase that
gets a lot right:

- **The deterministic-math / LLM-for-reasoning discipline is real and consistent.** Every single
  agent — OCR, GST, Budgets, Forecasts, CFO — follows the same rule: numbers come from SQL/Python,
  the LLM only explains or classifies. This is stated as a principle in most AI projects and
  actually *followed* in very few. Here it's followed in all seven agents.
- **Authorization is real, not cosmetic.** `ensure_owns_business()` runs before every business-
  scoped read or write, server-side. A user cannot see or touch another business's data by editing
  a request — verified live this session (cross-business access correctly returns 403).
- **RLS is enabled on all 9 tables**, no exceptions, no forgotten table.
- **No secrets committed to git** — `.env*` is gitignored and confirmed untracked.
- **No XSS surface** — zero use of `dangerouslySetInnerHTML` anywhere in the frontend.
- **Token encryption is done properly**, not homegrown — Fernet (authenticated encryption), with
  an explicit, correct warning about key loss and backup.
- **The codebase is genuinely easy to extend.** One agent module, one router, one page per
  feature, consistently. Phase 8 (Automations) — a materially more complex feature than any prior
  phase — landed cleanly *because* the pattern was already established. That's a real architectural
  payoff, not a coincidence.
- **The verification culture this project has practiced is unusually rigorous for having no formal
  test suite.** Every phase was checked against live data, not just "looks right" — and that
  practice *found real bugs* (the PaddleOCR PIL→numpy mismatch, the GST schema mismatch, two
  receipt-parsing traps) that would otherwise have shipped silently. The instinct is right; it's
  just not yet automated (see §3).
- **The connector abstraction (Phase 8) is genuinely forward-looking** — Drive/Dropbox/Outlook are
  additive, not a rewrite, because the `Connector` protocol was designed before Gmail was built,
  not extracted after the fact.

---

## 2. What needs fixing — security & reliability (do these first)

These are the ones that matter before anyone but you touches this system.

### 2.1 No rate limiting anywhere
Every endpoint, including the two that call an LLM per request (`/chat`, `/cfo/brief`), has zero
request throttling. A single misbehaving client — or a scripted loop — can run up NVIDIA API cost
or exhaust the deployment with no resistance. **Fix:** add `slowapi` (already FastAPI-native) with
per-user limits on the LLM-calling endpoints at minimum.

### 2.2 Silent exception handling — four confirmed instances, zero logging
`accounting_agent.py` (×2), `cfo_agent.py`, `ocr_agent.py` each have a bare
```python
except Exception:
    return <fallback>
```
with **no logging call of any kind**. If the LLM starts failing on every request — expired key,
provider outage, malformed response — the system will silently degrade forever (every expense
becomes `"Other"`, every CFO brief becomes the generic fallback message) with no signal that
anything is wrong. **Fix:** at minimum, `logging.exception(...)` in every one of these before the
fallback return. This is a five-minute fix with outsized value.

### 2.3 No server-side upload size limit
The Receipts page UI *says* "max 10MB," but nothing enforces it — `receipts.py` and
`core/ingest.py` accept any file size the client sends. A large or malicious upload flows straight
into Storage, then PaddleOCR (CPU/memory cost), then the vision LLM (API cost) before anything
would reject it. **Fix:** enforce a real size cap in `upload_receipt()` before the Storage call.

### 2.4 `.single()` in `orchestrator.py` is a fragility point
`supabase.table("receipts").select(...).eq("id", ...).single().execute()` raises if zero *or* more
than one row matches. A receipt row that hasn't committed yet (race with the insert), or any future
data anomaly, throws an unhandled exception mid-pipeline. **Fix:** `.execute()` +
manual `len(data) == 1` check with a clear error message.

### 2.5 Durable state is still not durable
`DATABASE_URL` is blank → the LangGraph checkpointer runs on the **in-memory fallback**. Any
receipt paused for human review is lost on a backend restart. This has been true since Phase 1 and
is the single highest-leverage "flip a config value" fix available — a Supabase Postgres
connection string is one paste away.

### 2.6 Scheduled polling isn't actually scheduled
`INNGEST_EVENT_KEY`/`SIGNING_KEY` are blank → the Gmail 15-minute cron is wired but inert; only
manual "Sync now" works today. Not urgent (manual sync covers the feature), but worth knowing
before telling anyone "receipts sync automatically."

---

## 3. What needs fixing — testing & observability (the structural gap)

This is the section that determines whether the system stays trustworthy as it grows, not just
whether it works today.

### 3.1 Zero automated tests
No `pytest`, no `jest`/`vitest`, no end-to-end test, no CI. Every verification this project has
done — and there's been a lot of *good* verification — was a hand-run script, mostly never
committed. "Tested" currently means "someone ran a script by hand on a specific date." The next
code change, even a trivial one, has no automatic protection. Two real regressions this session
(the GST schema mismatch, the PaddleOCR type mismatch) prove this isn't theoretical — both shipped
silently and were only caught because a human happened to run the first-ever real test.

**Concrete starting set** (all cheap, no LLM cost, pure-logic or DB-backed):
- `test_gst_agent.py` — `evaluate_itc()` across the blocked-category/rate-slab/missing-GSTIN matrix
- `test_auth.py` — `ensure_owns_business()` allows the owner, rejects everyone else
- `test_ocr_parsing.py` — promote `verify_ocr.py`'s SROIE ground-truth check into a real assertion-based test
- `test_forecast_agent.py` — `build_forecast()` trend/burn-rate math against synthetic series
- `test_automations_sync.py` — the dedup/cap logic from this session's Phase 8 verification, as a committed test instead of a scratchpad script

### 3.2 No structured logging
Six `print()` statements in the entire backend; zero use of Python's `logging` module. Combined
with §2.2, this means production failures are effectively invisible. **Fix:** a single
`app/core/logging.py` with a configured logger, used everywhere `print()` or a silent `except`
currently is.

### 3.3 Sentry/PostHog were in the original architecture doc, never implemented
Not urgent pre-launch, but worth resolving the gap between "the report says this" and "the code
does this" — either wire them or remove the claim.

---

## 4. What needs fixing — completeness (the roadmap items, unchanged priority)

Covered in depth in `AUDIT_REPORT.md`; summarized here for one place to look:
- **Phase 9** — no Fraud agent; the orchestrator is still 2 nodes (`OCR → Accounting`), not the
  full chained graph. GST/Budgets/Forecasts/CFO exist but run independently per-page, not as
  per-receipt pipeline stages.
- **Phase 10** — no teams/roles, no approvals, no audit-log UI (the data in `agent_runs` is
  already rich — nothing surfaces it), no API keys, no ERP export.
- **Phase 2** — no correction-feedback loop; categorization doesn't learn from user corrections.
- **Frontend accessibility** — zero `aria-*`/`alt` attributes anywhere in the codebase. Fine for a
  personal/demo build, a real gap for anything used by more than one person.

---

## 5. The roadmap — in the order I'd actually do it

```
Week 1  ── Security & reliability hardening (§2)
  • Rate limiting on /chat and /cfo/brief                      [~2 hrs]
  • Fix all 4 silent excepts → log the exception               [~30 min]
  • Server-side upload size cap                                 [~30 min]
  • Fix orchestrator.py's .single() call                        [~20 min]
  • Set DATABASE_URL to real Postgres                            [~15 min, biggest ROI here]

Week 1–2 ── Testing foundation (§3.1)
  • Stand up backend/tests/ with the 5 concrete tests above
  • Wire a GitHub Actions workflow: run on every push
  • (Frontend) add component tests for Budgets/Forecasts math — pure functions, cheap

Week 2 ── Observability (§3.2, §3.3)
  • app/core/logging.py, replace print()/silent-except with real logging
  • Decide: implement Sentry for real, or remove it from the architecture doc

Week 3+ ── Phase 9 (Fraud agent + real per-receipt chain)
  • Highest-value remaining feature work; builds on a now-hardened, now-tested base

Week 4+ ── Phase 10 (Enterprise) + accessibility pass + production deployment
```

**Why this order:** the security/reliability items are cheap (hours, not days) and each closes a
real exposure. Testing comes next because everything built after it becomes safer to build — doing
it before Phase 9 means Phase 9 can't silently break Phase 1–8 the way nothing currently prevents
that. Observability and the remaining phases follow once the foundation won't crumble under them.
