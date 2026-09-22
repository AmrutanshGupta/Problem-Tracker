import uuid
from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.auth.jwt import get_current_user
from app.db.models import ReviewSchedule
from app.events.logger import append_event
from app.cache.service import cache

router = APIRouter(prefix="/review", tags=["review"])

class ReviewScheduleResponse(BaseModel):
    problem_id: str
    ease_factor: float
    interval_days: int
    repetition_count: int
    due_at: datetime
    last_reviewed_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

class QualityScore(BaseModel):
    quality: int # 0-5

@router.get("/due", response_model=List[ReviewScheduleResponse])
def get_due_reviews(db: Session = Depends(get_db), current_user: uuid.UUID = Depends(get_current_user)):
    cache_key = f"due_reviews_{current_user}"
    cached_data = cache.get(cache_key)
    if cached_data is not None:
        return cached_data

    now = datetime.utcnow()
    due = db.query(ReviewSchedule).filter(
        ReviewSchedule.user_id == current_user,
        ReviewSchedule.due_at <= now
    ).order_by(ReviewSchedule.due_at.asc()).all()
    
    # Store in cache
    cache.set(cache_key, due)
    return due

@router.post("/{problem_id}/schedule", response_model=ReviewScheduleResponse)
def schedule_review(problem_id: str, db: Session = Depends(get_db), current_user: uuid.UUID = Depends(get_current_user)):
    existing = db.query(ReviewSchedule).filter(
        ReviewSchedule.problem_id == problem_id,
        ReviewSchedule.user_id == current_user
    ).first()
    
    if existing:
        return existing
        
    now = datetime.utcnow()
    due_at = now + timedelta(days=3)
    
    new_schedule = ReviewSchedule(
        problem_id=problem_id,
        user_id=current_user,
        ease_factor=2.5,
        interval_days=3,
        repetition_count=0,
        due_at=due_at,
        last_reviewed_at=now
    )
    db.add(new_schedule)
    
    append_event(db, current_user, "ReviewScheduled", {
        "problem_id": problem_id,
        "ease_factor": 2.5,
        "interval_days": 3,
        "repetition_count": 0,
        "due_at": due_at.isoformat()
    })
    
    db.commit()
    db.refresh(new_schedule)
    
    # Invalidate cache
    cache.delete(f"due_reviews_{current_user}")
    
    return new_schedule

@router.post("/{problem_id}/complete", response_model=ReviewScheduleResponse)
def complete_review(problem_id: str, score: QualityScore, db: Session = Depends(get_db), current_user: uuid.UUID = Depends(get_current_user)):
    schedule = db.query(ReviewSchedule).filter(
        ReviewSchedule.problem_id == problem_id,
        ReviewSchedule.user_id == current_user
    ).first()
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Review schedule not found")
        
    q = score.quality
    if q < 0 or q > 5:
        raise HTTPException(status_code=400, detail="Quality score must be 0-5")
        
    # SM-2 logic
    if q < 3:
        schedule.repetition_count = 0
        schedule.interval_days = 1
    elif schedule.repetition_count == 0:
        schedule.interval_days = 3
    elif schedule.repetition_count == 1:
        schedule.interval_days = 7
    else:
        schedule.interval_days = round(schedule.interval_days * schedule.ease_factor)
        
    schedule.repetition_count += 1
    schedule.ease_factor = max(1.3, schedule.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
    
    now = datetime.utcnow()
    schedule.due_at = now + timedelta(days=schedule.interval_days)
    schedule.last_reviewed_at = now
    
    append_event(db, current_user, "ReviewCompleted", {
        "problem_id": problem_id,
        "quality_score": q
    })
    
    db.commit()
    db.refresh(schedule)
    
    # Invalidate cache
    cache.delete(f"due_reviews_{current_user}")
    
    return schedule
