from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from app.auth.jwt import create_access_token
from app.config import settings
import uuid
# We will need db dependency and user models later, stubbed for now

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    # Stub: Accept any username/password and generate a determinisitic UUID based on username
    # In a real app we would check the DB and verify password hash
    if not form_data.username or not form_data.password:
         raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    # Generate consistent UUID for testing from username
    user_id = uuid.uuid5(uuid.NAMESPACE_DNS, form_data.username)
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user_id)}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}
