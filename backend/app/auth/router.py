from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta
import bcrypt
import uuid

from app.auth.jwt import create_access_token, get_current_user
from app.config import settings
from app.db.session import get_db
from app.db.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Explicitly register a new user account."""
    if not form_data.username or not form_data.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    if len(form_data.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(form_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(User).filter(User.username == form_data.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        id=uuid.uuid4(),
        username=form_data.username,
        hashed_password=bcrypt.hashpw(form_data.password.encode(), bcrypt.gensalt()).decode()
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "username": user.username},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "username": user.username}


@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Login with existing credentials."""
    if not form_data.username or not form_data.password:
        raise HTTPException(status_code=400, detail="Username and password are required")

    user = db.query(User).filter(User.username == form_data.username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not bcrypt.checkpw(form_data.password.encode(), user.hashed_password.encode()):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "username": user.username},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "username": user.username}


@router.get("/me")
async def get_profile(current_user_id: uuid.UUID = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the currently authenticated user's profile."""
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user.id),
        "username": user.username,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
