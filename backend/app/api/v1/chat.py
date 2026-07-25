"""
Chat API — Phase 4 (AI Chat)
POST /api/v1/chat          → ask a question; returns a grounded answer
GET  /api/v1/chat/history  → load recent conversation for a business+user
"""
import json

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_core.messages import AIMessage, HumanMessage, BaseMessage

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business
from app.core.limiter import limiter
from app.agents.chat_agent import run_chat_agent, stream_chat_agent

router = APIRouter()

HISTORY_LIMIT = 8


class ChatIn(BaseModel):
    business_id: str
    message: str


def _persist_user_message(sb, business_id: str, user_id: str, message: str) -> None:
    sb.table("chat_messages").insert({
        "business_id": business_id, "user_id": user_id, "role": "user", "content": message,
    }).execute()


def _load_history(sb, business_id: str, user_id: str) -> list[BaseMessage]:
    """Prior turns (chronological), excluding the just-inserted current message."""
    prior = (
        sb.table("chat_messages")
        .select("role, content")
        .eq("business_id", business_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(HISTORY_LIMIT + 1)  # +1 = the message we just inserted
        .execute().data or []
    )
    prior = list(reversed(prior))[:-1]
    return [
        (HumanMessage(m["content"]) if m["role"] == "user" else AIMessage(m["content"]))
        for m in prior
    ]


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

    _persist_user_message(sb, payload.business_id, user_id, payload.message)
    history = _load_history(sb, payload.business_id, user_id)

    # Run the tool-calling agent
    answer, tools_used = await run_chat_agent(payload.business_id, payload.message, history)

    _persist_assistant_message(sb, payload.business_id, user_id, answer, tools_used)
    return {"answer": answer, "tools_used": tools_used}


def _persist_assistant_message(sb, business_id: str, user_id: str, answer: str, tools_used: list) -> None:
    sb.table("chat_messages").insert({
        "business_id": business_id,
        "user_id": user_id,
        "role": "assistant",
        "content": answer,
        "tool_calls": {"tools_used": tools_used} if tools_used else None,
    }).execute()


@router.post("/stream")
@limiter.limit("15/minute")
async def chat_stream(request: Request, payload: ChatIn, user: dict = Depends(get_current_user)):
    """Server-Sent Events variant of /chat: streams the answer token-by-token for
    a fast time-to-first-token. Emits `data: {json}\\n\\n` events of type
    token/tool/done (see stream_chat_agent), then persists the full reply."""
    ensure_owns_business(payload.business_id, user["id"])
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    user_id = user["id"]
    sb = get_supabase()
    _persist_user_message(sb, payload.business_id, user_id, payload.message)
    history = _load_history(sb, payload.business_id, user_id)

    async def event_stream():
        answer, tools_used = "", []
        try:
            async for ev in stream_chat_agent(payload.business_id, payload.message, history):
                if ev["type"] == "done":
                    answer, tools_used = ev["answer"], ev["tools_used"]
                yield f"data: {json.dumps(ev)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"
        finally:
            # Persist whatever answer we managed to produce (empty on hard failure).
            if answer:
                _persist_assistant_message(sb, payload.business_id, user_id, answer, tools_used)

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",  # disable proxy buffering so tokens flush promptly
    })
