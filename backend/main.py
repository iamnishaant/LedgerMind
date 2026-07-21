"""
AI FinanceOS — FastAPI Backend
Entry point: main.py
"""
import asyncio
import sys

# psycopg's async mode (used by the LangGraph Postgres checkpointer) cannot
# run under Windows' default ProactorEventLoop — it raises InterfaceError the
# first time a connection is opened. Must be set before ANY event loop is
# created, so this runs before every other import in this file. Confirmed via
# a live durability test against real Supabase Postgres: without this, the
# checkpointer would silently fall back to in-memory on every Windows run.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import logging

# Backend-wide logging — replaces the print()-only status quo. Every module
# does `logging.getLogger(__name__)`; this is the one place that configures
# where those logs actually go and how they're formatted.
#
# force=True (not just an early basicConfig call) because several transitive
# imports below (paddleocr, langgraph, inngest, etc.) configure the root
# logger's handlers as an import side effect. Without force=True, basicConfig
# silently no-ops per its own documented behavior ("does nothing if the root
# logger already has handlers"), and every logger quietly stays at Python's
# default WARNING level regardless of the `level=` argument here — confirmed
# happening in this exact codebase before this fix.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    force=True,
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

import inngest.fast_api
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.limiter import limiter
from app.core.inngest_app import inngest_client, INNGEST_FUNCTIONS
from app.api.v1 import receipts, expenses, agents, health, chat, budgets, forecasts, gst, cfo, automations, audit, team, approvals, api_keys, export

# Re-assert the level AFTER all imports above: one of these (PaddleOCR is the
# known offender) calls logging.getLogger().setLevel(...) itself as an import
# side effect, silently overriding the basicConfig(level=...) call above no
# matter how early it ran or that force=True was set. Confirmed happening in
# this exact codebase — without this line, every logger.exception() call
# added elsewhere in this project would be silently dropped below WARNING.
logging.getLogger().setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    print(f"🚀 AI FinanceOS Backend starting — {settings.ENV} mode")
    yield
    print("⏹  AI FinanceOS Backend shutting down")


app = FastAPI(
    title="AI FinanceOS API",
    description="Agentic Financial Operating System for Small Businesses",
    version="0.1.0",
    lifespan=lifespan,
)

# ── Rate limiting (see app/core/limiter.py) ──────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ─────────────────────────────────────────────────
app.include_router(health.router,    prefix="/api/v1",           tags=["Health"])
app.include_router(receipts.router,  prefix="/api/v1/receipts",  tags=["Receipts"])
app.include_router(expenses.router,  prefix="/api/v1/expenses",  tags=["Expenses"])
app.include_router(agents.router,    prefix="/api/v1/agents",    tags=["Agents"])
app.include_router(chat.router,      prefix="/api/v1/chat",      tags=["Chat"])
app.include_router(budgets.router,   prefix="/api/v1/budgets",   tags=["Budgets"])
app.include_router(forecasts.router, prefix="/api/v1/forecasts", tags=["Forecasts"])
app.include_router(gst.router,       prefix="/api/v1/gst",       tags=["GST"])
app.include_router(cfo.router,       prefix="/api/v1/cfo",       tags=["CFO"])
app.include_router(automations.router, prefix="/api/v1/automations", tags=["Automations"])
app.include_router(audit.router,     prefix="/api/v1/audit",     tags=["Audit"])
app.include_router(team.router,      prefix="/api/v1/team",      tags=["Team"])
app.include_router(approvals.router, prefix="/api/v1/approvals", tags=["Approvals"])
app.include_router(api_keys.router,  prefix="/api/v1/api-keys",  tags=["API Keys"])
app.include_router(export.router,    prefix="/api/v1/export",    tags=["Export"])

# ── Inngest (scheduled connector polling; see app/core/inngest_app.py) ──
inngest.fast_api.serve(app, inngest_client, INNGEST_FUNCTIONS, serve_path="/api/inngest")
