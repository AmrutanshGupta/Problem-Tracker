from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from app.auth.jwt import create_access_token
from app.config import settings
from app.db.session import get_db
from app.db.models import User
from passlib.hash import bcrypt
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    if not form_data.username or not form_data.password:
         raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    # Auto-register user if they don't exist
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user:
        user = User(
            id=uuid.uuid5(uuid.NAMESPACE_DNS, form_data.username),
            username=form_data.username,
            hashed_password=bcrypt.hash(form_data.password)
        )
        db.add(user)
        db.commit()
    else:
        # Verify password
        if not bcrypt.verify(form_data.password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect username or password")
            
    user_id = user.id
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user_id)}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}
