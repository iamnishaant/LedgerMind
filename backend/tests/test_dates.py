"""
month_bounds() — pure logic, no DB.

Pins the bug this replaced: the old f"{month}-32" trick produced an invalid
date literal for EVERY month (max real day is 31), so Postgres rejected any
month-filtered query outright — including for July, the month this was
caught in. Every case here is a month where the old trick would have failed
identically (there's no month where "-32" is a valid date).
"""
from app.core.dates import month_bounds


def test_31_day_month_the_bug_was_caught_on():
    assert month_bounds("2026-07") == ("2026-07-01", "2026-08-01")


def test_30_day_month():
    assert month_bounds("2026-06") == ("2026-06-01", "2026-07-01")


def test_february_non_leap_year():
    assert month_bounds("2026-02") == ("2026-02-01", "2026-03-01")


def test_february_leap_year():
    assert month_bounds("2024-02") == ("2024-02-01", "2024-03-01")


def test_december_rolls_over_to_next_year():
    assert month_bounds("2026-12") == ("2026-12-01", "2027-01-01")


def test_january():
    assert month_bounds("2026-01") == ("2026-01-01", "2026-02-01")
