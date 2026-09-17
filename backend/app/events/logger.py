import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from app.db.models import EventLog

def append_event(db: Session, user_id: uuid.UUID, event_type: str, payload: dict):
    event = EventLog(
        user_id=user_id,
        event_type=event_type,
        payload=payload,
        client_timestamp=datetime.utcnow() # In real app, this would come from client
    )
    db.add(event)
    db.commit()
    return event
