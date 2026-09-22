import time
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import traceback

from app.auth.router import router as auth_router
from app.bookmarks.router import router as bookmarks_router
from app.review.router import router as review_router
from app.analytics.router import router as analytics_router
from app.analytics.jobs import analytics_worker
from app.logging_config import logger
from app.db.session import engine

app = FastAPI(title="Problem Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        logger.info(f"{request.method} {request.url.path} -> {response.status_code} ({process_time:.2f}ms)")
        return response
    except Exception as e:
        process_time = (time.time() - start_time) * 1000
        logger.error(f"{request.method} {request.url.path} -> 500 ({process_time:.2f}ms)\n{traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

import asyncio
@app.on_event("startup")
async def startup_event():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("Backend started, DB connection OK")
        
        # Start background worker
        asyncio.create_task(analytics_worker())
        logger.info("Background analytics worker started")
    except Exception as e:
        logger.error(f"DB connection failed: {e}")
        raise

app.include_router(auth_router)
app.include_router(bookmarks_router)
app.include_router(review_router)
app.include_router(analytics_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}
