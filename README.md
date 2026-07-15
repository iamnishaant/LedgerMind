# LedgerMind

> An agentic financial operating system for small businesses: a virtual accountant, bookkeeper, analyst, and CFO in one platform.

## Architecture

```text
User -> Next.js 16 Dashboard (App Router, Framer Motion)
     -> Supabase (Auth, PostgreSQL, Storage, RLS)
     -> Python FastAPI backend  (/api/v1)
     -> LangGraph Orchestrator  (durable Postgres checkpointer + human-in-the-loop)
     -> AI Agents (OCR -> Accounting -> GST -> Budget -> Forecast -> CFO)
     -> LLMs (Claude default, GPT switchable)
```

The Next.js app owns UI, auth, and Supabase reads. The FastAPI service runs PaddleOCR and the LangGraph agent graph natively and writes via the Supabase service-role key. Low-confidence OCR pauses the graph at a breakpoint for human review, then resumes the same thread from its checkpoint.

## Monorepo Structure

```text
Business_project/
├── frontend/        # Next.js, TypeScript, TailwindCSS
├── backend/         # Python FastAPI + LangGraph + PaddleOCR
├── supabase/        # Database schema and migrations
└── docs/            # Architecture and build notes
```

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Framer Motion, Recharts, Lucide |
| Backend | Python 3.11+, FastAPI, LangGraph, PaddleOCR, Pydantic |
| Database | Supabase, PostgreSQL, pgvector, Storage, RLS |
| AI Agents | LangGraph, Claude/GPT, PaddleOCR, LayoutLM planned |
| Orchestration | LangGraph durable checkpointer, Postgres, human-in-the-loop breakpoints |
| Infrastructure | Inngest, Stripe, PostHog, Sentry, Vercel |

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.11+
- Supabase account

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
