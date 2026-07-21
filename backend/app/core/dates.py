"""
Month-range date math shared across list/summary/export endpoints.
"""
from __future__ import annotations

from datetime import date


def month_bounds(month: str) -> tuple[str, str]:
    """
    Given a 'YYYY-MM' string, return (first_day_iso, first_day_of_next_month_iso)
    — an inclusive/exclusive [start, end) pair safe to use with .gte()/.lt().

    Replaces the previous f"{month}-32" trick: "-32" is an invalid date
    literal for every month (the max real day is 31), so Postgres rejected
    the query outright for any 31-day month — including July, silently
    broken for the current month until a live test caught it.
    """
    year, mon = (int(p) for p in month.split("-"))
    start = date(year, mon, 1)
    next_month = date(year + 1, 1, 1) if mon == 12 else date(year, mon + 1, 1)
    return start.isoformat(), next_month.isoformat()
