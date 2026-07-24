from datetime import date, timedelta


def calculate_current_streak(completed_dates: set[date], today: date | None = None) -> int:
    if today is None:
        today = date.today()

    if today in completed_dates:
        cursor = today
    elif (today - timedelta(days=1)) in completed_dates:
        cursor = today - timedelta(days=1)
    else:
        return 0

    streak = 0
    while cursor in completed_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak
