from datetime import datetime

from pydantic import BaseModel


class HabitCreate(BaseModel):
    name: str
    description: str | None = None


class HabitUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class HabitResponse(BaseModel):
    id: int
    name: str
    description: str | None
    created_at: datetime
    current_streak: int
    week_completed_count: int
    week_goal: int = 7
