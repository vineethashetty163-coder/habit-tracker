from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import Habit, HabitLog, User
from app.deps import get_current_user, get_db
from app.schemas.stats import DailyCompletion, WeeklyStats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/weekly", response_model=WeeklyStats)
def weekly_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    start_date = today - timedelta(days=6)

    habit_count = db.query(Habit).filter(Habit.user_id == current_user.id).count()

    rows = (
        db.query(HabitLog.completed_date, func.count(HabitLog.id))
        .join(Habit, Habit.id == HabitLog.habit_id)
        .filter(Habit.user_id == current_user.id)
        .filter(HabitLog.completed_date >= start_date, HabitLog.completed_date <= today)
        .group_by(HabitLog.completed_date)
        .all()
    )
    counts_by_date = {row[0]: row[1] for row in rows}

    daily_completions = []
    cursor = start_date
    while cursor <= today:
        daily_completions.append(
            DailyCompletion(date=cursor, completed_count=counts_by_date.get(cursor, 0))
        )
        cursor += timedelta(days=1)

    total_completions = sum(day.completed_count for day in daily_completions)
    completion_rate = (total_completions / (habit_count * 7)) if habit_count > 0 else 0.0

    return WeeklyStats(
        start_date=start_date,
        end_date=today,
        daily_completions=daily_completions,
        total_completions=total_completions,
        completion_rate=round(completion_rate, 4),
    )
