from datetime import date, timedelta

from app.services.streaks import calculate_current_streak


def test_streak_zero_when_no_completions():
    assert calculate_current_streak(set()) == 0


def test_streak_counts_today_and_backward():
    today = date(2026, 7, 24)
    dates = {today, today - timedelta(days=1), today - timedelta(days=2)}
    assert calculate_current_streak(dates, today=today) == 3


def test_streak_still_active_if_yesterday_done_but_not_today_yet():
    today = date(2026, 7, 24)
    dates = {today - timedelta(days=1), today - timedelta(days=2)}
    assert calculate_current_streak(dates, today=today) == 2


def test_streak_broken_if_gap_before_yesterday():
    today = date(2026, 7, 24)
    dates = {today - timedelta(days=2)}
    assert calculate_current_streak(dates, today=today) == 0


def test_streak_stops_at_first_gap():
    today = date(2026, 7, 24)
    dates = {today, today - timedelta(days=1), today - timedelta(days=3)}
    assert calculate_current_streak(dates, today=today) == 2
