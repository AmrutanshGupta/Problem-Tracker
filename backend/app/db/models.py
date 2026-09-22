import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, Float, ForeignKey, JSON, Uuid
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class EventLog(Base):
    """Immutable event log for all actions"""
    __tablename__ = "event_log"
    event_id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id"), index=True)
    event_type = Column(String, index=True) # BookmarkAdded, SnapshotSaved, etc.
    payload = Column(JSON)
    client_timestamp = Column(DateTime)
    server_timestamp = Column(DateTime, default=datetime.utcnow)

class Bookmark(Base):
    __tablename__ = "bookmarks"
    problem_id = Column(String, primary_key=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    platform = Column(String)
    title = Column(String)
    url = Column(String)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

class ReviewSchedule(Base):
    __tablename__ = "review_schedule"
    problem_id = Column(String, primary_key=True)
    user_id = Column(Uuid(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    ease_factor = Column(Float, default=2.5)
    interval_days = Column(Integer, default=3)
    repetition_count = Column(Integer, default=0)
    due_at = Column(DateTime)
    last_reviewed_at = Column(DateTime, default=datetime.utcnow)
