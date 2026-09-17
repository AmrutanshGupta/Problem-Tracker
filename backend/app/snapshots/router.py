import uuid
import hashlib
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.auth.jwt import get_current_user
from app.db.models import CodeSnapshot, Bookmark
from app.events.logger import append_event

router = APIRouter(prefix="/snapshots", tags=["snapshots"])

class SnapshotCreate(BaseModel):
    problem_id: str
    language: str
    code_text: str

class SnapshotResponse(BaseModel):
    id: uuid.UUID
    problem_id: str
    language: str
    code_text: str
    code_hash: str

    class Config:
        orm_mode = True
        from_attributes = True

@router.post("", response_model=SnapshotResponse)
def save_snapshot(snapshot: SnapshotCreate, db: Session = Depends(get_db), current_user: uuid.UUID = Depends(get_current_user)):
    # Hash the code text
    code_hash = hashlib.sha256(snapshot.code_text.encode('utf-8')).hexdigest()
    
    # Check if a snapshot with this exact code hash already exists (Deduplication)
    existing = db.query(CodeSnapshot).filter(
        CodeSnapshot.code_hash == code_hash,
        CodeSnapshot.problem_id == snapshot.problem_id,
        CodeSnapshot.user_id == current_user
    ).first()
    
    if existing:
        return existing
        
    new_snapshot = CodeSnapshot(
        problem_id=snapshot.problem_id,
        user_id=current_user,
        language=snapshot.language,
        code_text=snapshot.code_text,
        code_hash=code_hash
    )
    db.add(new_snapshot)
    db.commit()
    db.refresh(new_snapshot)
    
    # Emit event
    append_event(db, current_user, "SnapshotSaved", {
        "problem_id": snapshot.problem_id,
        "snapshot_id": str(new_snapshot.id),
        "language": snapshot.language,
        "code_hash": code_hash
    })
    
    return new_snapshot

@router.get("/{problem_id}", response_model=List[SnapshotResponse])
def get_snapshots(problem_id: str, db: Session = Depends(get_db), current_user: uuid.UUID = Depends(get_current_user)):
    snapshots = db.query(CodeSnapshot).filter(
        CodeSnapshot.problem_id == problem_id,
        CodeSnapshot.user_id == current_user
    ).order_by(CodeSnapshot.created_at.asc()).all()
    
    return snapshots
