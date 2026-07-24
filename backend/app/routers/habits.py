from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.models import Habit, HabitLog, User
from app.deps import get_current_user, get_db
from app.schemas.habit import HabitCreate, HabitResponse, HabitUpdate
from app.services.streaks import calculate_current_streak

router = APIRouter(prefix="/habits", tags=["habits"])


def _get_owned_habit(db: Session, habit_id: int, user: User) -> Habit:
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.user_id == user.id).first()
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    return habit


def _to_response(habit: Habit) -> HabitResponse:
    completed_dates = {log.completed_date for log in habit.logs}
    return HabitResponse(
        id=habit.id,
        name=habit.name,
        description=habit.description,
        created_at=habit.created_at,
        current_streak=calculate_current_streak(completed_dates),
    )


@router.get("", response_model=list[HabitResponse])
def list_habits(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    habits = (
        db.query(Habit)
        .filter(Habit.user_id == current_user.id)
        .order_by(Habit.created_at)
        .all()
    )
    return [_to_response(habit) for habit in habits]


@router.post("", response_model=HabitResponse, status_code=status.HTTP_201_CREATED)
def create_habit(
    payload: HabitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    habit = Habit(user_id=current_user.id, name=payload.name, description=payload.description)
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return _to_response(habit)


@router.put("/{habit_id}", response_model=HabitResponse)
def update_habit(
    habit_id: int,
    payload: HabitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    habit = _get_owned_habit(db, habit_id, current_user)
    if payload.name is not None:
        habit.name = payload.name
    if payload.description is not None:
        habit.description = payload.description
    db.commit()
    db.refresh(habit)
    return _to_response(habit)


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(
    habit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    habit = _get_owned_habit(db, habit_id, current_user)
    db.delete(habit)
    db.commit()


@router.post("/{habit_id}/complete", response_model=HabitResponse)
def toggle_complete(
    habit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    habit = _get_owned_habit(db, habit_id, current_user)
    today = date.today()

    existing_log = (
        db.query(HabitLog)
        .filter(HabitLog.habit_id == habit.id, HabitLog.completed_date == today)
        .first()
    )
    if existing_log is not None:
        db.delete(existing_log)
    else:
        db.add(HabitLog(habit_id=habit.id, completed_date=today))

    db.commit()
    db.refresh(habit)
    return _to_response(habit)
