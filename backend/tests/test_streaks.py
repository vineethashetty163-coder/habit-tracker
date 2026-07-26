from datetime import date, timedelta

from app.services.streaks import calculate_current_streak, calculate_week_completed_count


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


def test_week_completed_count_zero_when_no_completions():
    assert calculate_week_completed_count(set()) == 0


def test_week_completed_count_counts_all_seven_days():
    today = date(2026, 7, 24)
    dates = {today - timedelta(days=offset) for offset in range(7)}
    assert calculate_week_completed_count(dates, today=today) == 7


def test_week_completed_count_ignores_dates_outside_the_window():
    today = date(2026, 7, 24)
    dates = {today, today - timedelta(days=7), today - timedelta(days=8)}
    assert calculate_week_completed_count(dates, today=today) == 1


def test_week_completed_count_partial_week():
    today = date(2026, 7, 24)
    dates = {today, today - timedelta(days=2), today - timedelta(days=4)}
    assert calculate_week_completed_count(dates, today=today) == 3
