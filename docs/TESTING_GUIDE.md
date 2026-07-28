# LedgerMind — User Testing Guide

A hands-on, click-through guide to exercising **every component** of the system the way a real user would — not the automated `pytest` suite (that's for developers), but manual acceptance testing in the actual UI.

It answers two things:
1. **What data/technique do I use?** — some features (Forecasts, CFO, Budgets, Fraud) need *volume and history* you can't create by uploading one receipt. The repo ships seed scripts and a real receipt dataset for exactly this.
2. **How do I verify each feature works?** — each scenario below has **Goal → Steps → Expect → Verify**.

---

## 0. Before you start

- Apply `supabase/schema.sql` to your Supabase project (one time).
- `backend/.env` has real `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, and an LLM key (`NVIDIA_API_KEY` is set by default). `DATABASE_URL` set for the durable checkpointer.
- `frontend/.env.local` has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`.
- Start both servers — double-click **`start-dev.bat`**, or run them manually (see the README). Backend → http://localhost:8000, frontend → http://localhost:3000.

All seed/utility commands below are run from `backend/` with the venv Python:
```bat
cd backend
venv\Scripts\python scripts\<script>.py
```

---

## 1. Get test data (the "dataset/technique" answer)

There are three kinds of test data, for three kinds of features.

### A. A pre-filled demo account — for Budgets, Forecasts, CFO, Chat, GST
These features compute over **months of history**. Don't upload 100 receipts by hand — seed it:

```bat
venv\Scripts\python scripts\seed_demo.py       # demo user + business + storage bucket
venv\Scripts\python scripts\seed_expenses.py   # ~4 months of realistic Indian expenses
venv\Scripts\python scripts\seed_budgets.py    # 4 monthly budgets
```

This creates a login you'll use for most of the guide:
- **Email:** `demo@financeos.local`
- **Password:** `DemoPass123!`

`seed_expenses.py` inserts ~120 days of spend across **8 categories** (Software, Travel, Food, Office, Marketing, Utilities, Professional Services, Equipment) with realistic vendors, GST rates, plausible GSTINs (≈15% intentionally missing a GSTIN), and a few duplicates. That's enough for every aggregate feature to have something real to show. Re-run with `--fresh` to reset seeded rows.

> Seeded rows are tagged `agent_tags: ["seed"]` and are inserted directly — they do **not** create Audit Log entries or fraud flags (those only come from the real receipt pipeline; see §2 and the Fraud/Approvals scenarios).

### B. Real receipt images — for OCR, Accounting, and the agent pipeline
To test the actual upload → OCR → book-expense chain, you need receipt images. Either:
- **Your own phone photos** of receipts (best realism). For GST features, use **Indian receipts that print a GSTIN**.
- **The SROIE dataset** (1,000 real scanned receipts with ground-truth labels), fetched by the repo:
  ```bat
  venv\Scripts\pip install datasets
  venv\Scripts\python scripts\fetch_sample_receipts.py 8
  ```
  Images land in `backend/sample_receipts/` with a `ground_truth.json`. (Alternative dataset if SROIE's schema changes: `naver-clova-ix/cord-v2`.)

### C. Constructed patterns — for Fraud & Approvals
Fraud is deterministic and compares a new expense against the business's history. To trigger it as a user, upload a receipt that's an **outlier** — e.g. a very large amount for a vendor you've bought from many times, or a **brand-new vendor with a large amount** (≈4×+ your average), or the **same receipt twice on the same day** (split-invoice signal). See the Fraud/Approvals scenario.

---

## 2. 10-minute smoke test (happy path)

1. Log in as `demo@financeos.local` / `DemoPass123!` → you land on the **Dashboard** (dark theme, no washed-out/light areas).
2. **Expenses** → a filterable table of seeded expenses; summary tiles show totals. Filter by a category chip.
3. **Budgets** → 4 budgets with live spend bars; at least one should read **At risk** or **Over** given the seeded spend.
4. **GST** → recoverable ITC total + a "needs a GSTIN" follow-up list (from the ~15% missing).
5. **Forecasts** → a history line + a dashed projection for the next months.
6. **CFO Agent** → generates a narrative brief citing real numbers (this calls the LLM; give it a few seconds).
7. **AI Chat** → ask *"How much did I spend on Software & Subscriptions last month?"* → it calls a tool and answers with a real figure.
8. Upload one receipt (**Receipts → upload**) → watch it process, then appear in **Expenses**, with agent runs in **Audit Log**.

If all eight work, the system is healthy. The rest of the guide is the exhaustive version.

---

## 3. Component-by-component walkthrough

### 3.1 Auth & onboarding
- **Goal:** sign-up, login, and first-business creation.
- **Steps:** For the onboarding flow specifically, sign up a **fresh** account at `/login` (note: if your Supabase project requires email confirmation, either confirm the email or disable that toggle in Supabase Auth settings — the seeded demo user is pre-confirmed so it skips this). A brand-new user with no business is redirected to **/onboarding** → create a business.
- **Expect:** after creating a business you reach the dashboard; the sidebar shows the business name.
- **Verify:** you can't reach `/dashboard/*` while logged out (it redirects to `/login`).

### 3.2 Receipts → the agent pipeline (OCR → Accounting → Fraud → Budget Monitor)
- **Goal:** the core per-receipt chain end to end.
- **Steps:** **Receipts → Upload**, choose a real receipt image (§1B). Wait for processing (OCR + a vision-LLM cross-check + classification — this is the slow LLM path).
- **Expect:** the receipt appears with a status; a matching expense is booked.
- **Verify:** open **Expenses** — a new row with vendor/amount/category. Open **Audit Log** — you should see `ocr_agent`, `accounting_agent`, `fraud_agent`, and `budget_monitor` runs for that receipt. That four-agent trail is the proof the whole chain ran.
- **Edge cases to try:** a blurry/low-quality image (should route to a lower confidence / needs-review state); a huge file (>10 MB is rejected server-side); an empty file (rejected).

### 3.3 Expenses
- **Goal:** listing, filtering, summary, fraud badge.
- **Steps:** open **Expenses** (as the demo user for volume). Use the category chips and the search box.
- **Expect:** summary tiles (filtered total, GST recoverable, count) update with filters; duplicates show a **dup** badge; any fraud-flagged expense shows a **review/high risk** badge (hover for the reason).
- **Verify:** the filtered total matches roughly what you'd expect for the category.

### 3.4 GST intelligence
- **Goal:** ITC eligibility and follow-ups.
- **Steps:** open **GST** (demo user).
- **Expect:** total recoverable ITC, a breakdown, and a "missing GSTIN" follow-up list (seed data leaves ~15% without a GSTIN on purpose).
- **Verify:** blocked categories (per GST rules) are correctly shown as ineligible even when they have a GSTIN.

### 3.5 AI Chat
- **Goal:** tool-calling answers grounded in real data.
- **Steps:** open **AI Chat** and ask, e.g.:
  - *"What were my top 5 vendors last month?"*
  - *"How much GST can I recover this month?"*
  - *"Show my most recent expenses."*
- **Expect:** answers cite real figures from your books (never invented); it uses tools under the hood.
- **Verify:** cross-check a number against the Expenses page. Also confirm it's **rate-limited** — rapid-fire ~16 messages in a minute should start returning a "too many requests" response.
- **Note:** responses are currently non-streaming and can feel slow on the default NVIDIA model — that's the known latency item, not a bug.

### 3.6 Budgets
- **Goal:** create, live status, delete.
- **Steps:** as demo user the page is pre-seeded. Also create your own: **New budget** → name, category, monthly limit.
- **Expect:** each budget shows spend vs limit, a % bar, a run-rate **projection**, and a state (On track / At risk / Over). With seeded spend, some will be At risk/Over.
- **Verify:** delete a budget → it disappears immediately.

### 3.7 Forecasts
- **Goal:** trend projection (needs ≥3 months history — the seed provides ~4).
- **Steps:** open **Forecasts** (demo user).
- **Expect:** a solid actuals line joining a dashed projection with no gap; a trend label (rising/falling/stable).
- **Verify:** the projection direction matches the seeded trend.

### 3.8 CFO Agent
- **Goal:** an LLM brief over precomputed metrics.
- **Steps:** open **CFO Agent** (demo user) and generate the brief.
- **Expect:** a headline + risks/opportunities/actions, each citing a **specific real number** (₹ figures from budgets/forecast/GST/this month). Takes a few seconds (LLM).
- **Verify:** the numbers it cites match the other pages. It should never invent a figure.

### 3.9 Automations (Gmail) — Phase 8
- **Goal:** connect Gmail and auto-ingest receipts.
- **Steps:** **Automations → Connect Gmail** → Google consent → grant read-only → back to the app showing **Connected** → **Sync now**.
- **Expect:** connected state; sync pulls receipt-like emails through the same pipeline as §3.2.
- **Verify:** new rows in Receipts/Expenses + agent runs in Audit Log for synced items.
- **Known limitation:** this needs the one-time OAuth click-through (the only unfinished roadmap item). If the OAuth consent screen is in *Testing* status, your Google account must be on its **Test users** list, or Google blocks it. Scheduled auto-polling stays inert until `INNGEST_*` keys are set — "Sync now" is the live path.

### 3.10 Audit Log — Phase 10
- **Goal:** visibility into every agent run.
- **Steps:** open **Audit Log** after uploading/syncing at least one receipt.
- **Expect:** rows per agent (OCR/Accounting/Fraud/Budget Monitor), with status, a per-agent summary (OCR confidence, chosen category, fraud risk, budget alerts), filter chips, and success-rate tiles.
- **Verify:** filter by agent and by status; a failed run (if any) shows its error.
- **Note:** seeded expenses don't appear here — only real pipeline runs do.

### 3.11 Team & roles — Phase 10
- **Goal:** multi-user access and role control. **Needs a second account.**
- **Steps:** as owner, **Team → Invite member** → copy the invite link. In a different browser/incognito, sign up/log in as a second user, open the invite link (`/join/<token>`), accept.
- **Expect:** the second user joins as **member** and can now see the business's dashboard. As owner you can promote/demote or remove them.
- **Verify:**
  - A **member** cannot invite, change roles, or remove people (buttons hidden; API returns 403 if forced).
  - You **cannot remove or demote the last owner** (guard).
  - **Tenant isolation:** the second user, before accepting, cannot see the business's data at all.

### 3.12 Approvals — Phase 10
- **Goal:** owner sign-off on fraud-flagged expenses.
- **Steps:** trigger a **high**-risk expense (§1C) — e.g. upload a large receipt from a brand-new vendor, or a big outlier for a seeded vendor. It lands in **Approvals** as *pending*.
- **Expect:** the Approvals queue shows the expense with the **specific fraud reasons**; as owner you can **Approve** or **Reject** (with a reason).
- **Verify:**
  - A **member** sees the queue but can't decide (owner-only).
  - After a decision the item leaves the queue; you can't decide it twice.
- **Fallback:** if you can't easily construct a flagged receipt, the fraud logic itself is covered by `backend/tests/test_fraud_agent.py` and the gate by `test_fraud_approval_gate.py`.

### 3.13 API Keys & Export — Phase 10
- **Goal:** programmatic access + CSV export.
- **Steps:** **API Keys → New key** (owner) → copy the key shown **once**. Then click **Download CSV**. Test the key with the API directly:
  ```bash
  curl -H "Authorization: Bearer fos_..." \
    "http://localhost:8000/api/v1/export/expenses.csv?business_id=<id>"
  ```
- **Expect:** the CSV downloads with expense columns incl. GST + fraud_risk + approval_status; the API key works; **revoking** it makes the same request fail.
- **Verify:**
  - A **member** can download CSV but cannot create/revoke keys (owner-only).
  - An API key from **another business** is rejected (403) against this business's export.

---

## 4. Cross-cutting checks (do these throughout)

- **Dark theme:** every page renders on the dark navy background with readable text — no washed-out/light panels, no unreadable gray blobs (this was a recently-fixed bug; re-check after any UI change).
- **Empty states:** a brand-new business (before seeding) shows clean "nothing yet" messages on Budgets/Expenses/Audit/Approvals, not errors.
- **Backend-offline fallback:** stop the backend and reload Expenses/Budgets — pages should show *sample data / "backend offline"* rather than crashing.
- **Auth gating:** logged out, every `/dashboard/*` route redirects to `/login`.
- **Tenant isolation (important for a finance app):** create a second business/user and confirm one can never see the other's expenses, budgets, receipts, keys, or team — by clicking *and* by tampering with `business_id` in a request.
- **Rate limiting:** `/chat` and `/cfo/brief` throttle under rapid repeated calls.

---

## 5. Coverage checklist

| Component | Data needed | How verified |
| --- | --- | --- |
| Auth / onboarding | fresh signup | redirect to /onboarding, business created |
| Receipt pipeline | real receipt image | expense booked + 4 agent runs in Audit Log |
| Expenses | seed or real | table, filters, summary, dup/fraud badges |
| GST | seed | ITC total + missing-GSTIN list |
| AI Chat | seed | tool-grounded answers + rate limit |
| Budgets | seed | live status, projection, create/delete |
| Forecasts | seed (≥3 months) | actuals + dashed projection, trend |
| CFO brief | seed | narrative citing real ₹ figures |
| Automations | Gmail OAuth | connect + sync → pipeline |
| Audit Log | real pipeline run | per-agent rows, filters |
| Team & roles | 2nd account | invite/accept, role guards, isolation |
| Approvals | constructed fraud (§1C) | queue, owner-only decide |
| API Keys & Export | owner | key once, CSV, revoke, cross-tenant 403 |
| Dark theme / empty / offline / isolation / rate-limit | — | §4 |

---

## 6. What can't be fully tested as a "normal user" (and where it's covered instead)

- **Multi-month history without waiting** → use the seed scripts (§1A).
- **Fraud precision / edge cases** → constructed uploads (§1C) show it end-to-end, but the exhaustive matrix lives in `backend/tests/test_fraud_agent.py`.
- **Gmail auto-polling (scheduled)** → inert until `INNGEST_*` keys are set; only manual "Sync now" is live.
- **Everything deterministic (GST rules, budget math, forecast fit, auth/RLS, checkpointer durability)** → 108 backend tests (`cd backend && venv\Scripts\python -m pytest tests/`) run these live against real Supabase, no mocking. The manual guide above complements them; it doesn't replace them.
