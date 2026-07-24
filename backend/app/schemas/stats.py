from datetime import date

from pydantic import BaseModel


class DailyCompletion(BaseModel):
    date: date
    completed_count: int


class WeeklyStats(BaseModel):
    start_date: date
    end_date: date
    daily_completions: list[DailyCompletion]
    total_completions: int
    completion_rate: float
