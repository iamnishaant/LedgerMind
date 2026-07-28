"""
Chat session (thread) behaviour.

Conversations used to be one flat log per (business, user): no way to start a
clean chat, revisit an old one, or delete a thread — and every past question
leaked into every later answer's context. These pin the grouping rules.

The ownership check matters most: the backend talks to Supabase with the
service-role key, which BYPASSES RLS, so `_own_session` is the actual access
control. Without it any authenticated user could read or delete someone else's
conversation by guessing an id.
"""
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

import app.api.v1.chat as chat


# ── Titles ───────────────────────────────────────────────────

def test_title_comes_from_the_opening_question():
    assert chat._derive_title("What did I spend on software?") == "What did I spend on software?"


def test_long_title_is_truncated_with_ellipsis():
    title = chat._derive_title("x" * 200)
    assert len(title) <= chat.TITLE_MAX_CHARS
    assert title.endswith("…")


def test_title_whitespace_is_collapsed():
    assert chat._derive_title("  how   much   GST?  ") == "how much GST?"


def test_blank_message_falls_back_to_placeholder():
    assert chat._derive_title("   ") == "New chat"


# ── Ownership ────────────────────────────────────────────────

def _sb_returning(rows):
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=rows)
    return sb


def test_owner_can_open_their_session():
    sb = _sb_returning([{"id": "s-1", "user_id": "u-1", "title": "t", "business_id": "b-1"}])
    assert chat._own_session(sb, "s-1", "u-1")["id"] == "s-1"


def test_another_users_session_is_not_readable():
    """Must 404 — not return the row, and not leak that it exists."""
    sb = _sb_returning([{"id": "s-1", "user_id": "u-2", "title": "t", "business_id": "b-1"}])
    with pytest.raises(HTTPException) as exc:
        chat._own_session(sb, "s-1", "u-1")
    assert exc.value.status_code == 404


def test_missing_session_404s():
    with pytest.raises(HTTPException) as exc:
        chat._own_session(_sb_returning([]), "nope", "u-1")
    assert exc.value.status_code == 404


# ── Session resolution ───────────────────────────────────────

def test_new_chat_creates_a_session_titled_from_the_message(monkeypatch):
    created = {}

    def _create(sb, business_id, user_id, title):
        created.update(business_id=business_id, user_id=user_id, title=title)
        return {"id": "s-new", "title": title}

    monkeypatch.setattr(chat, "_create_session", _create)
    out = chat._resolve_session(MagicMock(), "b-1", "u-1", None, "Top vendors this month?")

    assert out["id"] == "s-new"
    assert created["title"] == "Top vendors this month?"
    assert created["user_id"] == "u-1"


def test_existing_session_is_reused_not_duplicated():
    sb = _sb_returning([{"id": "s-1", "user_id": "u-1", "title": "Earlier question", "business_id": "b-1"}])
    out = chat._resolve_session(sb, "b-1", "u-1", "s-1", "follow-up")
    assert out["id"] == "s-1"
    assert out["title"] == "Earlier question"     # an established title is kept


def test_placeholder_title_is_replaced_by_first_real_message():
    """A thread created empty is named 'New chat' until something is asked."""
    sb = _sb_returning([{"id": "s-1", "user_id": "u-1", "title": "New chat", "business_id": "b-1"}])
    out = chat._resolve_session(sb, "b-1", "u-1", "s-1", "How much GST can I recover?")
    assert out["title"] == "How much GST can I recover?"


def test_resolving_someone_elses_session_404s():
    sb = _sb_returning([{"id": "s-1", "user_id": "u-2", "title": "t", "business_id": "b-1"}])
    with pytest.raises(HTTPException):
        chat._resolve_session(sb, "b-1", "u-1", "s-1", "hello")


# ── History scoping ──────────────────────────────────────────

def test_history_is_scoped_to_one_thread():
    """A new chat must start clean — history filters on session_id, never on
    business+user, or old conversations bleed into fresh ones."""
    sb = MagicMock()
    q = sb.table.return_value.select.return_value.eq.return_value
    q.order.return_value.limit.return_value.execute.return_value = MagicMock(data=[])

    chat._load_history(sb, "s-1")

    sb.table.return_value.select.return_value.eq.assert_called_once_with("session_id", "s-1")
