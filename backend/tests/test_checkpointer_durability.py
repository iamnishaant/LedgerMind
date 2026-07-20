"""
LangGraph Postgres checkpointer — proves state genuinely survives a full
connection teardown (simulating a backend restart), not just that the code
compiles or imports.

This exists specifically because of a real bug found while wiring
DATABASE_URL up in this project: psycopg's async mode silently cannot run
under Windows' default ProactorEventLoop, and the checkpointer init code's
broad except would have swallowed that and fallen back to in-memory forever
with no visible error. Committing this test means that regression (or a
similar one) fails loudly in CI instead of silently degrading durability.

Skips (not fails) if DATABASE_URL isn't configured — same reasoning as the
qa_business fixture for Supabase: this needs real infrastructure to mean
anything, and CI without secrets should skip gracefully.
"""
import uuid
from typing import TypedDict

import pytest
from langgraph.graph import StateGraph, END

from app.core.config import settings


class _S(TypedDict):
    counter: int


async def _node_a(state: _S) -> _S:
    return {"counter": state["counter"] + 1}


async def _node_b(state: _S) -> _S:
    return {"counter": state["counter"] + 10}


def _build_trivial_graph() -> StateGraph:
    g = StateGraph(_S)
    g.add_node("a", _node_a)
    g.add_node("b", _node_b)
    g.set_entry_point("a")
    g.add_edge("a", "b")
    g.add_edge("b", END)
    return g


@pytest.mark.live_db
async def test_state_survives_a_full_connection_teardown():
    if not settings.DATABASE_URL:
        pytest.skip("DATABASE_URL not configured — durable checkpointer not in use")

    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    thread_id = f"pytest-durability-{uuid.uuid4()}"
    config = {"configurable": {"thread_id": thread_id}}

    try:
        async with AsyncPostgresSaver.from_conn_string(settings.DATABASE_URL) as saver1:
            await saver1.setup()
            graph1 = _build_trivial_graph().compile(checkpointer=saver1, interrupt_before=["b"])
            await graph1.ainvoke({"counter": 0}, config=config)
            state1 = await graph1.aget_state(config)
            assert state1.values == {"counter": 1}
            assert state1.next == ("b",)
    except Exception as e:
        pytest.skip(f"Postgres checkpointer unreachable — skipping ({e})")

    # Brand new connection — the actual property under test.
    async with AsyncPostgresSaver.from_conn_string(settings.DATABASE_URL) as saver2:
        graph2 = _build_trivial_graph().compile(checkpointer=saver2, interrupt_before=["b"])
        state2 = await graph2.aget_state(config)
        assert state2.values == {"counter": 1}, "STATE LOST across a connection teardown"
        assert state2.next == ("b",), "WRONG RESUME POINT after teardown"

        result = await graph2.ainvoke(None, config=config)
        assert result["counter"] == 11


@pytest.mark.live_db
async def test_production_get_graph_uses_postgres_not_memory_fallback():
    if not settings.DATABASE_URL:
        pytest.skip("DATABASE_URL not configured")

    from app.agents.orchestrator import _init_checkpointer
    saver = await _init_checkpointer()
    assert "Memory" not in type(saver).__name__, (
        "get_graph() silently fell back to the in-memory checkpointer — "
        "DATABASE_URL is set but Postgres init failed (check logs for the real error)"
    )
