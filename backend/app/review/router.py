"""
SM2 Spaced Repetition Review Router
=====================================
Implements the canonical SuperMemo-2 algorithm as specified at:
https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method

Algorithm Summary
-----------------
Each card carries three state variables:
  - repetitions  (n)  : count of *consecutive* successful reviews (q >= 3). Resets to 0 on failure.
  - ease_factor  (EF) : difficulty modifier, starts at 2.5, min 1.3.
  - interval_days (I) : days until next review.

On review with quality score q (0–5):
  - q < 3  (failure): reset repetitions=0, interval=1. EF still updated.
  - q >= 3 (success):
      - n=0  → I = 1
      - n=1  → I = 6
      - n>=2 → I = round(prev_I × EF)
      increment repetitions by 1.

EF update (always applied, regardless of q):
  EF_new = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
  EF_new = max(1.3, EF_new)

Quality scale:
  0 - Complete blackout
  1 - Incorrect; remembered on seeing answer
  2 - Incorrect; answer seemed easy to recall
  3 - Correct with serious difficulty
  4 - Correct after hesitation
  5 - Correct immediately / perfect recall
"""

import uuid
from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from app.db.session import get_db
from app.auth.jwt import get_current_user
from app.db.models import ReviewSchedule, Bookmark
from app.events.logger import append_event
from app.cache.service import cache

router = APIRouter(prefix="/review", tags=["review"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ReviewScheduleResponse(BaseModel):
    problem_id: str
    ease_factor: float
    interval_days: int
    repetitions: int
    due_at: datetime
    last_reviewed_at: datetime
    title: str | None = None
    url: str | None = None

    class Config:
        from_attributes = True


class QualityScore(BaseModel):
    quality: int  # 0–5

    @field_validator("quality")
    @classmethod
    def quality_must_be_0_to_5(cls, v: int) -> int:
        if v < 0 or v > 5:
            raise ValueError("quality must be an integer between 0 and 5 inclusive")
        return v


# ---------------------------------------------------------------------------
# Pure SM2 computation (no side effects — easy to unit-test in isolation)
# ---------------------------------------------------------------------------

def _sm2_next_interval(repetitions: int, interval_days: int, ease_factor: float, quality: int) -> int:
    """
    Compute the next interval in days given current SM2 state and a quality score.
    This is a pure function — no DB access.

    Rules (canonical SM2):
      - quality < 3  → reset: interval = 1  (card goes back to start)
      - quality >= 3 → progress:
          n=0 (first success)  → interval = 1
          n=1 (second success) → interval = 6
          n>=2                 → interval = round(prev_interval × ease_factor)
    """
    if quality < 3:
        return 1
    if repetitions == 0:
        return 1
    if repetitions == 1:
        return 6
    return round(interval_days * ease_factor)


def _sm2_next_ease_factor(ease_factor: float, quality: int) -> float:
    """
    Compute the new ease factor.
    Applied on every review regardless of pass/fail.
    Minimum value is 1.3.
    """
    new_ef = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    return max(1.3, new_ef)


def _sm2_next_repetitions(repetitions: int, quality: int) -> int:
    """
    Compute the next repetition count.
      - quality < 3  → reset to 0 (failure, start over)
      - quality >= 3 → increment by 1
    """
    if quality < 3:
        return 0
    return repetitions + 1


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

def _invalidate_user_cache(user_id: uuid.UUID) -> None:
    cache.delete(f"due_reviews_{user_id}")


def _enrich_with_bookmark_data(schedules: list, db: Session, user_id) -> list:
    """
    For each ReviewSchedule, look up the matching Bookmark (same problem_id + user_id)
    and attach title + url. Returns a list of dicts so Pydantic can deserialize them.
    If no matching bookmark exists, title = problem_id, url = None.
    """
    if not schedules:
        return schedules

    # Fetch all relevant bookmarks in ONE query (not N+1)
    problem_ids = [s.problem_id for s in schedules]
    bookmarks = db.query(Bookmark).filter(
        Bookmark.user_id == user_id,
        Bookmark.problem_id.in_(problem_ids),
    ).all()
    bm_map = {bm.problem_id: bm for bm in bookmarks}

    enriched = []
    for s in schedules:
        bm = bm_map.get(s.problem_id)
        enriched.append({
            "problem_id": s.problem_id,
            "ease_factor": s.ease_factor,
            "interval_days": s.interval_days,
            "repetitions": s.repetitions,
            "due_at": s.due_at,
            "last_reviewed_at": s.last_reviewed_at,
            "title": bm.title if bm else s.problem_id,
            "url": bm.url if bm else None,
        })
    return enriched


@router.get("/due", response_model=List[ReviewScheduleResponse])
def get_due_reviews(
    db: Session = Depends(get_db),
    current_user: uuid.UUID = Depends(get_current_user),
):
    """Return all cards whose due_at <= now, ordered oldest-due-first."""
    cache_key = f"due_reviews_{current_user}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    now = datetime.utcnow()
    due = (
        db.query(ReviewSchedule)
        .filter(
            ReviewSchedule.user_id == current_user,
            ReviewSchedule.due_at <= now,
        )
        .order_by(ReviewSchedule.due_at.asc())
        .all()
    )

    enriched = _enrich_with_bookmark_data(due, db, current_user)
    cache.set(cache_key, enriched)
    return enriched


@router.get("/all", response_model=List[ReviewScheduleResponse])
def get_all_reviews(
    db: Session = Depends(get_db),
    current_user: uuid.UUID = Depends(get_current_user),
):
    """Return every review card for the current user, regardless of due date."""
    schedules = (
        db.query(ReviewSchedule)
        .filter(ReviewSchedule.user_id == current_user)
        .order_by(ReviewSchedule.due_at.asc())
        .all()
    )
    return _enrich_with_bookmark_data(schedules, db, current_user)


@router.post("/{problem_id}/schedule", response_model=ReviewScheduleResponse)
def schedule_review(
    problem_id: str,
    db: Session = Depends(get_db),
    current_user: uuid.UUID = Depends(get_current_user),
):
    """
    Add a problem to the SM2 review queue.
    Initial state: EF=2.5, repetitions=0, interval=1 day (due tomorrow).
    If the problem is already scheduled, the existing record is returned unchanged.
    """
    existing = db.query(ReviewSchedule).filter(
        ReviewSchedule.problem_id == problem_id,
        ReviewSchedule.user_id == current_user,
    ).first()

    if existing:
        return existing

    now = datetime.utcnow()
    due_at = now + timedelta(days=1)

    new_schedule = ReviewSchedule(
        problem_id=problem_id,
        user_id=current_user,
        ease_factor=2.5,
        interval_days=1,
        repetitions=0,
        due_at=due_at,
        last_reviewed_at=now,
    )
    db.add(new_schedule)

    append_event(db, current_user, "ReviewScheduled", {
        "problem_id": problem_id,
        "ease_factor": 2.5,
        "interval_days": 1,
        "repetitions": 0,
        "due_at": due_at.isoformat(),
    })

    db.commit()
    db.refresh(new_schedule)

    _invalidate_user_cache(current_user)
    return new_schedule


@router.post("/{problem_id}/complete", response_model=ReviewScheduleResponse)
def complete_review(
    problem_id: str,
    score: QualityScore,
    db: Session = Depends(get_db),
    current_user: uuid.UUID = Depends(get_current_user),
):
    """
    Submit a review result for a problem.

    Quality scale (q):
      0–2 → Failure: interval resets to 1 day, repetitions reset to 0.
      3–5 → Success: interval advances per SM2 schedule, repetitions increment.

    EF is always updated (even on failure) per the SM2 spec.
    """
    schedule = db.query(ReviewSchedule).filter(
        ReviewSchedule.problem_id == problem_id,
        ReviewSchedule.user_id == current_user,
    ).first()

    if not schedule:
        raise HTTPException(status_code=404, detail="Review schedule not found. Call /schedule first.")

    q = score.quality

    # --- Compute new SM2 state (pure functions, no side effects) ---
    new_interval = _sm2_next_interval(schedule.repetitions, schedule.interval_days, schedule.ease_factor, q)
    new_ef = _sm2_next_ease_factor(schedule.ease_factor, q)
    new_repetitions = _sm2_next_repetitions(schedule.repetitions, q)

    # --- Apply new state ---
    old_state = {
        "repetitions": schedule.repetitions,
        "interval_days": schedule.interval_days,
        "ease_factor": schedule.ease_factor,
    }

    schedule.interval_days = new_interval
    schedule.ease_factor = new_ef
    schedule.repetitions = new_repetitions
    schedule.last_reviewed_at = datetime.utcnow()
    schedule.due_at = schedule.last_reviewed_at + timedelta(days=new_interval)

    append_event(db, current_user, "ReviewCompleted", {
        "problem_id": problem_id,
        "quality_score": q,
        "before": old_state,
        "after": {
            "repetitions": new_repetitions,
            "interval_days": new_interval,
            "ease_factor": round(new_ef, 4),
        },
        "next_due": schedule.due_at.isoformat(),
    })

    db.commit()
    db.refresh(schedule)

    _invalidate_user_cache(current_user)
    return schedule


@router.delete("/{problem_id}/schedule", status_code=204)
def remove_from_review(
    problem_id: str,
    db: Session = Depends(get_db),
    current_user: uuid.UUID = Depends(get_current_user),
):
    """Remove a problem from the review queue entirely (e.g. when un-bookmarking)."""
    schedule = db.query(ReviewSchedule).filter(
        ReviewSchedule.problem_id == problem_id,
        ReviewSchedule.user_id == current_user,
    ).first()

    if not schedule:
        raise HTTPException(status_code=404, detail="Review schedule not found")

    db.delete(schedule)
    db.commit()
    _invalidate_user_cache(current_user)
