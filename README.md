# LedgerMind

> An agentic financial operating system for small businesses: a virtual accountant, bookkeeper, analyst, and CFO in one platform.

Upload a receipt (or connect Gmail) and a chain of AI agents reads it, books the expense, checks it for fraud, and watches it against your budgets — with every number computed deterministically and the LLM used only to reason and explain, never to invent figures.

## Status

10 of 11 roadmap phases are built and live-verified. The one remaining item is a manual Gmail OAuth click-through for Phase 8.

| Phase | Feature | Status |
| --- | --- | --- |
| 0 | Auth | Done |
| 1 | Expense tracking MVP | Done |
| 2 | AI bookkeeper (categorization) | Done |
| 3 | GST intelligence (ITC eligibility) | Done |
| 4 | AI chat (tool-calling over your books) | Done |
| 5 | Budget intelligence | Done |
| 6 | Forecasting | Done |
| 7 | AI CFO brief | Done |
| 8 | Automations (Gmail auto-ingest) | Code complete; OAuth click-through pending |
| 9 | Multi-agent / fraud | Done |
| 10 | Enterprise (teams, approvals, audit log, API keys, export) | Done |

## Architecture

```text
User -> Next.js 16 Dashboard (App Router, Motion, dark theme)
     -> Supabase (Auth, PostgreSQL, Storage, Row-Level Security)
     -> Python FastAPI backend (/api/v1)
     -> LangGraph Orchestrator (durable Postgres checkpointer + human-in-the-loop)
```

**Per-receipt agent chain** (one LangGraph graph, durable + resumable):

```text
OCR -> (human review if low confidence) -> Accounting -> Fraud -> Budget Monitor
```

**Business-level agents** run on demand (page load), not per receipt, because they are aggregates: **GST**, **Budgets**, **Forecasting**, and the **CFO brief**. **Chat** is a separate tool-calling agent that answers questions by running real queries against your books.

Design principle throughout: **numbers are computed by SQL/Python; the LLM only classifies and explains.** Every agent except OCR-classification and the CFO narrative is fully deterministic. Low-confidence OCR pauses the graph at a checkpoint for human review, then resumes the same thread.

## Monorepo structure

```text
Business_project/
├── frontend/        # Next.js 16, TypeScript, Tailwind, Motion
├── backend/         # Python 3.11 + FastAPI + LangGraph + PaddleOCR
├── supabase/        # schema.sql (fresh install) + migrations/ (incremental)
├── docs/            # roadmap, audit, status, and design docs
└── start-dev.bat    # one-click launcher for both servers (Windows)
```

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Motion, Recharts, Lucide |
| Backend | Python 3.11, FastAPI, LangGraph, PaddleOCR, Pydantic, slowapi |
| Database | Supabase, PostgreSQL, pgvector, Storage, RLS |
| AI | LangGraph tool-calling; provider-swappable LLM (Anthropic / OpenAI / NVIDIA NIM) |
| Orchestration | LangGraph durable Postgres checkpointer, human-in-the-loop breakpoints |
| Automations | Gmail OAuth ingest, Inngest scheduled polling |

## Getting started

### Prerequisites

- **Node.js 20+**
- **Python 3.11** — the backend is pinned to 3.11. Newer Pythons (3.12+) do not have wheels for some pinned/compiled dependencies (e.g. `numpy==1.26.4`, PaddlePaddle). If you have multiple Pythons installed, always target 3.11 explicitly with the `py -3.11` launcher.
- A Supabase project (URL + service-role + anon keys in `backend/.env`)

> ⚠️ **Do not run `python -m venv` if your default `python` is not 3.11.** On Windows the default is often a newer version; running `python -m venv venv` over an existing venv silently swaps its interpreter while leaving the old compiled packages behind, which fails at startup with `No module named 'pydantic_core._pydantic_core'`. Always use `py -3.11 -m venv venv`.

### One-click (Windows)

```bat
start-dev.bat
```

Opens the backend (http://localhost:8000, docs at `/docs`) and frontend (http://localhost:3000) in separate windows. It checks that the venv and `node_modules` exist and that the venv interpreter can load its packages, with a clear fix message if not.

### Manual

Backend:

```bash
cd backend
py -3.11 -m venv venv
venv\Scripts\pip install -r requirements.txt
venv\Scripts\python -m uvicorn main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Database

`supabase/schema.sql` is the source of truth for a **fresh** install — run it once in the Supabase SQL editor. `supabase/migrations/` holds the incremental history (`0002`–`0007`) for applying changes to an existing database instead.

## Testing

```bash
# backend — 108 tests, live against a real (dev) Supabase project, no mocking
cd backend && venv\Scripts\python -m pytest tests/

# frontend — pure-logic unit tests
cd frontend && npm test
```

Backend tests exercise real auth/RLS, the deterministic agents (GST, fraud, budgets, forecast), the automation sync logic, checkpointer durability, and every Phase 10 endpoint. DB-backed tests self-skip cleanly when no real Supabase credentials are present (e.g. in CI).

## Roadmap / next

- **Correction-feedback loop** — make categorization learn per-business from user corrections (a live, per-tenant alternative to fine-tuning). Design: [`docs/CORRECTION_FEEDBACK_LOOP.md`](docs/CORRECTION_FEEDBACK_LOOP.md).
- **Chat latency** — move to a fast hosted model (e.g. Claude Haiku) and stream responses (SSE).
- Complete the Phase 8 Gmail OAuth click-through and enable Inngest scheduled polling.

See [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) for the current snapshot and [`docs/BUILD_ROADMAP.md`](docs/BUILD_ROADMAP.md) for the full phase plan.
