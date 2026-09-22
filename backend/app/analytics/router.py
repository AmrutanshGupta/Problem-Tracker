from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from app.db.session import get_db
from app.auth.jwt import get_current_user
from app.db.models import User, UserDailyActivity

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/activity")
def get_user_activity(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """
    Returns the user's daily activity (simulated materialized view query)
    """
    activities = db.query(UserDailyActivity).filter(UserDailyActivity.user_id == current_user).order_by(UserDailyActivity.date.desc()).limit(30).all()
    
    return [
        {
            "date": a.date,
            "reviews_completed": a.reviews_completed,
            "bookmarks_added": a.bookmarks_added
        }
        for a in activities
    ]

