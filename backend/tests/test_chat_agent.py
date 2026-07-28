"""
Pure unit tests for the chat agent's latency-optimization layer (no DB, no LLM).

These pin the behavior that lets common questions answer in a single LLM call:
the injected snapshot, the tool-only fallback prompt, and the bounded history.
"""
from langchain_core.messages import AIMessage, HumanMessage

from app.agents import chat_agent as c


def test_build_snapshot_aggregates_month_rows():
    snap = c._build_snapshot(
        "2026-07",
        month_rows=[
            {"amount": 1000, "category": "Software & Subscriptions", "vendor_name": "AWS"},
            {"amount": 500, "category": "Travel", "vendor_name": "Ola"},
            {"amount": 250, "category": "Software & Subscriptions", "vendor_name": "AWS"},
        ],
        recent=[{"vendor_name": "AWS", "amount": 250, "category": "Software & Subscriptions", "expense_date": "2026-07-20"}],
        gst={"itc_recoverable": 180, "itc_blocked": 20, "missing_gstin_count": 1},
    )
    tm = snap["this_month"]
    assert tm["total_spend"] == 1750.0
    assert tm["expense_count"] == 3
    # highest-spend vendor first, amounts summed across rows
    assert tm["top_vendors"][0] == {"vendor": "AWS", "spent": 1250.0}
    assert tm["spend_by_category"]["Software & Subscriptions"] == 1250.0
    assert tm["gst_recoverable"] == 180


def test_build_snapshot_caps_categories_and_vendors():
    rows = [{"amount": i, "category": f"Cat{i}", "vendor_name": f"V{i}"} for i in range(1, 20)]
    snap = c._build_snapshot("2026-07", rows, [], {})
    assert len(snap["this_month"]["spend_by_category"]) <= 6
    assert len(snap["this_month"]["top_vendors"]) <= 5


def test_system_prompt_injects_snapshot_and_forbids_redundant_tool_calls():
    p = c._system_prompt({"this_month": {"total_spend": 1750.0}})
    assert "CURRENT FINANCIAL SNAPSHOT" in p
    assert "do NOT call a tool" in p
    assert "1750" in p  # the real figure is inlined for the model to quote


def test_system_prompt_falls_back_to_tools_without_snapshot():
    p = c._system_prompt({})
    assert "ALWAYS use the provided tools" in p
    assert "CURRENT FINANCIAL SNAPSHOT" not in p


def test_trim_history_bounds_turns_and_length():
    hist = []
    for _ in range(10):
        hist.append(HumanMessage("q" * 5000))
        hist.append(AIMessage("a" * 5000))
    trimmed = c._trim_history(hist)
    assert len(trimmed) <= c.HISTORY_TURNS
    assert all(len(m.content) <= c.HISTORY_CHAR_CAP + 1 for m in trimmed)  # +1 for the ellipsis
    # message roles are preserved
    assert isinstance(trimmed[-1], AIMessage)


def test_trim_history_handles_none():
    assert c._trim_history(None) == []
