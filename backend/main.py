"""
AI FinanceOS — FastAPI Backend
Entry point: main.py
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

import inngest.fast_api

from app.core.config import settings
from app.core.inngest_app import inngest_client, INNGEST_FUNCTIONS
from app.api.v1 import receipts, expenses, agents, health, chat, budgets, forecasts, gst, cfo, automations


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

# ── Inngest (scheduled connector polling; see app/core/inngest_app.py) ──
inngest.fast_api.serve(app, inngest_client, INNGEST_FUNCTIONS, serve_path="/api/inngest")
