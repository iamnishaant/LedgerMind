"""
Chat API — Phase 4 (AI Chat)
POST /api/v1/chat          → ask a question; returns a grounded answer
GET  /api/v1/chat/history  → load recent conversation for a business+user
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from langchain_core.messages import AIMessage, HumanMessage, BaseMessage

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business
from app.core.limiter import limiter
from app.agents.chat_agent import run_chat_agent

router = APIRouter()

HISTORY_LIMIT = 8


class ChatIn(BaseModel):
    business_id: str
    message: str


@router.get("/history")
async def get_history(business_id: str, limit: int = 30, user: dict = Depends(get_current_user)):
    """Return recent chat messages (chronological) for a business + user."""
    ensure_owns_business(business_id, user["id"])
    user_id = user["id"]
    sb = get_supabase()
    rows = (
        sb.table("chat_messages")
        .select("role, content, created_at")
        .eq("business_id", business_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute().data or []
    )
    return {"messages": list(reversed(rows))}


@router.post("")
@limiter.limit("15/minute")
async def chat(request: Request, payload: ChatIn, user: dict = Depends(get_current_user)):
    ensure_owns_business(payload.business_id, user["id"])
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    user_id = user["id"]
    sb = get_supabase()

    # Persist the user's message
    sb.table("chat_messages").insert({
        "business_id": payload.business_id,
        "user_id": user_id,
        "role": "user",
        "content": payload.message,
    }).execute()

    # Load prior turns for context
    prior = (
        sb.table("chat_messages")
        .select("role, content")
        .eq("business_id", payload.business_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(HISTORY_LIMIT + 1)  # +1 = the message we just inserted
        .execute().data or []
    )
    prior = list(reversed(prior))[:-1]  # chronological, drop the current message
    history: list[BaseMessage] = [
        (HumanMessage(m["content"]) if m["role"] == "user" else AIMessage(m["content"]))
        for m in prior
    ]

    # Run the tool-calling agent
    answer, tools_used = await run_chat_agent(payload.business_id, payload.message, history)

    # Persist the assistant's reply
    sb.table("chat_messages").insert({
        "business_id": payload.business_id,
        "user_id": user_id,
        "role": "assistant",
        "content": answer,
        "tool_calls": {"tools_used": tools_used} if tools_used else None,
    }).execute()

    return {"answer": answer, "tools_used": tools_used}
