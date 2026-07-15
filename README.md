# 🤖 AI FinanceOS

> An Agentic Financial Operating System for Small Businesses — your virtual Accountant, Bookkeeper, Analyst, and CFO in one platform.

## Architecture

```
User → Next.js 16 Dashboard (App Router, Framer Motion)
     → Supabase (Auth, PostgreSQL, Storage, RLS)
     → Python FastAPI backend  (/api/v1)
     → LangGraph Orchestrator  (durable Postgres checkpointer + human-in-the-loop)
     → AI Agents (OCR → Accounting → GST → Budget → Forecast → CFO)
     → LLMs (Claude default · GPT switchable)
```

The Next.js app owns UI + auth + Supabase reads. The FastAPI service runs
PaddleOCR and the LangGraph agent graph natively and writes via the Supabase
service-role key. Low-confidence OCR pauses the graph at a breakpoint for
human review, then resumes the same thread from its checkpoint.

## Monorepo Structure

```
Business_project/
├── frontend/        # Next.js 14, TypeScript, TailwindCSS, shadcn/ui
├── backend/         # Python FastAPI + LangGraph + PaddleOCR
├── supabase/        # Database schema, migrations, seed data
└── docs/            # Architecture, API specs
```

## Tech Stack

| Layer          | Technologies                                              |
|----------------|-----------------------------------------------------------|
| Frontend       | Next.js 16 (App Router), React 19, TypeScript, Framer Motion, Recharts, Lucide |
| Backend        | Python 3.11+, FastAPI, LangGraph, PaddleOCR, Pydantic     |
| Database       | Supabase (PostgreSQL + pgvector + Storage + RLS)          |
| AI Agents      | LangGraph, Claude (default) / GPT (switchable), PaddleOCR, LayoutLM (planned) |
| Orchestration  | LangGraph durable checkpointer (Postgres) + human-in-the-loop breakpoints |
| Infrastructure | Inngest, Stripe, PostHog, Sentry, Vercel                  |

## Roadmap — 10 Phases

| Phase | Name                    | Duration | Status     |
|-------|-------------------------|----------|------------|
| 1     | MVP — Expense Tracking  | 3–4 wks  | 🔨 Building |
| 2     | AI Bookkeeper           | 4 wks    | Planned    |
| 3     | GST Intelligence        | 3 wks    | Planned    |
| 4     | AI Chat (RAG)           | 4 wks    | Planned    |
| 5     | Budget Intelligence     | 3 wks    | Planned    |
| 6     | Forecasting             | 4 wks    | Planned    |
| 7     | AI CFO                  | 5 wks    | Planned    |
| 8     | Automation              | 5 wks    | Planned    |
| 9     | Multi-Agent Chain       | 4 wks    | Planned    |
| 10    | Enterprise              | 6 wks    | Planned    |

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
