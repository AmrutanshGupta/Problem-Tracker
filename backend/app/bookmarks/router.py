import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.auth.jwt import get_current_user
from app.db.models import Bookmark
from app.events.logger import append_event

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])

class BookmarkCreate(BaseModel):
    problem_id: str
    platform: str
    title: str
    url: str

class BookmarkResponse(BaseModel):
    problem_id: str
    platform: str
    title: str
    url: str
    is_active: int

    class Config:
        orm_mode = True
        from_attributes = True

@router.post("", response_model=BookmarkResponse)
def add_bookmark(bookmark: BookmarkCreate, db: Session = Depends(get_db), current_user: uuid.UUID = Depends(get_current_user)):
    # Emit event
    append_event(db, current_user, "BookmarkAdded", bookmark.model_dump())
    
    # Update derived table (idempotent)
    existing = db.query(Bookmark).filter(
        Bookmark.problem_id == bookmark.problem_id, 
        Bookmark.user_id == current_user
    ).first()
    
    if existing:
        existing.is_active = 1
        existing.title = bookmark.title
        existing.url = bookmark.url
        existing.platform = bookmark.platform
        db.commit()
        db.refresh(existing)
        return existing
    
    new_bm = Bookmark(
        problem_id=bookmark.problem_id,
        user_id=current_user,
        platform=bookmark.platform,
        title=bookmark.title,
        url=bookmark.url,
        is_active=1
    )
    db.add(new_bm)
    db.commit()
    db.refresh(new_bm)
    return new_bm

@router.get("", response_model=List[BookmarkResponse])
def get_bookmarks(db: Session = Depends(get_db), current_user: uuid.UUID = Depends(get_current_user)):
    # Object-level auth inherently enforced by `user_id == current_user`
    bookmarks = db.query(Bookmark).filter(
        Bookmark.user_id == current_user,
        Bookmark.is_active == 1
    ).all()
    return bookmarks

@router.delete("/{problem_id}")
def delete_bookmark(problem_id: str, db: Session = Depends(get_db), current_user: uuid.UUID = Depends(get_current_user)):
    bm = db.query(Bookmark).filter(
        Bookmark.problem_id == problem_id, 
        Bookmark.user_id == current_user
    ).first()
    
    if not bm or bm.is_active == 0:
        raise HTTPException(status_code=404, detail="Bookmark not found")
        
    append_event(db, current_user, "BookmarkRemoved", {"problem_id": problem_id})
    bm.is_active = 0
    db.commit()
    return {"status": "deleted"}
