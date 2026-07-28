"""
Chat API — Phase 4 (AI Chat)

Conversations are grouped into SESSIONS (threads), so a user can keep several
independent conversations, revisit an earlier one, or delete a thread outright.

GET    /api/v1/chat/sessions        → list this user's threads for a business
POST   /api/v1/chat/sessions        → start an empty thread
DELETE /api/v1/chat/sessions/{id}   → delete a thread and its messages
GET    /api/v1/chat/history         → messages in one thread
POST   /api/v1/chat                 → ask a question; returns a grounded answer
POST   /api/v1/chat/stream          → same, streamed token-by-token (SSE)

Both ask endpoints accept an optional session_id. When it's absent a thread is
created on the fly and its id is returned to the client — so the UI can open on
a blank chat and only persist one once the user actually says something.
"""
import json
import logging

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from langchain_core.messages import AIMessage, HumanMessage, BaseMessage

from app.core.supabase import get_supabase
from app.core.auth import get_current_user, ensure_owns_business
from app.core.limiter import limiter
from app.agents.chat_agent import run_chat_agent, stream_chat_agent

logger = logging.getLogger(__name__)

router = APIRouter()

HISTORY_LIMIT = 8
TITLE_MAX_CHARS = 60


class ChatIn(BaseModel):
    business_id: str
    message: str
    session_id: Optional[str] = None


class SessionIn(BaseModel):
    business_id: str
    title: Optional[str] = None


# ── Session helpers ──────────────────────────────────────────

def _derive_title(message: str) -> str:
    """A thread's name is its opening question, trimmed to fit the sidebar."""
    title = " ".join(message.split())
    if len(title) > TITLE_MAX_CHARS:
        title = title[: TITLE_MAX_CHARS - 1].rstrip() + "…"
    return title or "New chat"


def _own_session(sb, session_id: str, user_id: str) -> dict:
    """Fetch a session, enforcing that it belongs to the caller.

    The backend uses the service-role key (bypasses RLS), so this check IS the
    access control — without it any authenticated user could read or delete
    another user's threads by guessing an id.
    """
    rows = sb.table("chat_sessions").select("*").eq("id", session_id).execute().data or []
    if not rows or rows[0]["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Chat not found")
    return rows[0]


def _create_session(sb, business_id: str, user_id: str, title: str) -> dict:
    res = sb.table("chat_sessions").insert({
        "business_id": business_id, "user_id": user_id, "title": title,
    }).execute()
    return res.data[0]


def _touch_session(sb, session_id: str) -> None:
    """Bump updated_at so the thread rises to the top of the list."""
    from datetime import datetime, timezone
    try:
        sb.table("chat_sessions").update(
            {"updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", session_id).execute()
    except Exception:
        logger.exception("Could not bump session %r", session_id)


def _resolve_session(sb, business_id: str, user_id: str, session_id: Optional[str], message: str) -> dict:
    """Return the thread this message belongs to, creating one if needed.

    A brand-new chat has no row until the first message arrives — that keeps
    empty threads out of the user's list when they open the page and navigate
    away without asking anything.
    """
    if session_id:
        session = _own_session(sb, session_id, user_id)
        # A thread created empty keeps its placeholder name until it has content.
        if session.get("title") in (None, "", "New chat"):
            new_title = _derive_title(message)
            sb.table("chat_sessions").update({"title": new_title}).eq("id", session_id).execute()
            session["title"] = new_title
        return session
    return _create_session(sb, business_id, user_id, _derive_title(message))


# ── Message persistence ──────────────────────────────────────

def _persist_user_message(sb, business_id: str, user_id: str, session_id: str, message: str) -> None:
    sb.table("chat_messages").insert({
        "business_id": business_id, "user_id": user_id, "session_id": session_id,
        "role": "user", "content": message,
    }).execute()


def _persist_assistant_message(sb, business_id: str, user_id: str, session_id: str,
                               answer: str, tools_used: list) -> None:
    sb.table("chat_messages").insert({
        "business_id": business_id,
        "user_id": user_id,
        "session_id": session_id,
        "role": "assistant",
        "content": answer,
        "tool_calls": {"tools_used": tools_used} if tools_used else None,
    }).execute()


def _load_history(sb, session_id: str) -> list[BaseMessage]:
    """Prior turns in THIS thread (chronological), excluding the just-inserted message.

    Scoped to the session so a new chat genuinely starts clean — previously every
    question in the business bled into every later answer's context.
    """
    prior = (
        sb.table("chat_messages")
        .select("role, content")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .limit(HISTORY_LIMIT + 1)  # +1 = the message we just inserted
        .execute().data or []
    )
    prior = list(reversed(prior))[:-1]
    return [
        (HumanMessage(m["content"]) if m["role"] == "user" else AIMessage(m["content"]))
        for m in prior
    ]


# ── Sessions ─────────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(business_id: str, limit: int = 50, user: dict = Depends(get_current_user)):
    """This user's chat threads for a business, most recently used first."""
    ensure_owns_business(business_id, user["id"])
    sb = get_supabase()
    rows = (
        sb.table("chat_sessions")
        .select("id, title, created_at, updated_at")
        .eq("business_id", business_id)
        .eq("user_id", user["id"])
        .order("updated_at", desc=True)
        .limit(limit)
        .execute().data or []
    )
    return {"sessions": rows}


@router.post("/sessions")
async def create_session(payload: SessionIn, user: dict = Depends(get_current_user)):
    ensure_owns_business(payload.business_id, user["id"])
    sb = get_supabase()
    return _create_session(sb, payload.business_id, user["id"], payload.title or "New chat")


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    """Delete a thread. Messages go with it via ON DELETE CASCADE."""
    sb = get_supabase()
    _own_session(sb, session_id, user["id"])
    sb.table("chat_sessions").delete().eq("id", session_id).execute()
    return {"deleted": session_id}


# ── History ──────────────────────────────────────────────────

@router.get("/history")
async def get_history(
    business_id: str,
    session_id: Optional[str] = None,
    limit: int = 100,
    user: dict = Depends(get_current_user),
):
    """Messages in one thread (chronological). No session_id → empty, because a
    fresh chat starts blank rather than resuming whatever came before."""
    ensure_owns_business(business_id, user["id"])
    if not session_id:
        return {"messages": []}

    sb = get_supabase()
    _own_session(sb, session_id, user["id"])
    rows = (
        sb.table("chat_messages")
        .select("role, content, created_at")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute().data or []
    )
    return {"messages": list(reversed(rows)), "session_id": session_id}


# ── Ask ──────────────────────────────────────────────────────

@router.post("")
@limiter.limit("15/minute")
async def chat(request: Request, payload: ChatIn, user: dict = Depends(get_current_user)):
    ensure_owns_business(payload.business_id, user["id"])
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    user_id = user["id"]
    sb = get_supabase()

    session = _resolve_session(sb, payload.business_id, user_id, payload.session_id, payload.message)
    session_id = session["id"]

    _persist_user_message(sb, payload.business_id, user_id, session_id, payload.message)
    history = _load_history(sb, session_id)

    answer, tools_used = await run_chat_agent(payload.business_id, payload.message, history)

    _persist_assistant_message(sb, payload.business_id, user_id, session_id, answer, tools_used)
    _touch_session(sb, session_id)
    return {
        "answer": answer,
        "tools_used": tools_used,
        "session_id": session_id,
        "session_title": session["title"],
    }


@router.post("/stream")
@limiter.limit("15/minute")
async def chat_stream(request: Request, payload: ChatIn, user: dict = Depends(get_current_user)):
    """Server-Sent Events variant of /chat: streams the answer token-by-token for
    a fast time-to-first-token. Emits `data: {json}\\n\\n` events of type
    session/token/tool/done (see stream_chat_agent), then persists the full reply.

    The `session` event fires first so a client that started a brand-new chat
    learns the thread id immediately, without waiting for the answer."""
    ensure_owns_business(payload.business_id, user["id"])
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    user_id = user["id"]
    sb = get_supabase()

    session = _resolve_session(sb, payload.business_id, user_id, payload.session_id, payload.message)
    session_id = session["id"]

    _persist_user_message(sb, payload.business_id, user_id, session_id, payload.message)
    history = _load_history(sb, session_id)

    async def event_stream():
        yield f"data: {json.dumps({'type': 'session', 'id': session_id, 'title': session['title']})}\n\n"
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
                _persist_assistant_message(sb, payload.business_id, user_id, session_id, answer, tools_used)
            _touch_session(sb, session_id)

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",  # disable proxy buffering so tokens flush promptly
    })
