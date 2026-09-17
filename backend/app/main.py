from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.auth.router import router as auth_router
from app.bookmarks.router import router as bookmarks_router
from app.snapshots.router import router as snapshots_router
from app.review.router import router as review_router

app = FastAPI(title="Problem Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(bookmarks_router)
app.include_router(snapshots_router)
app.include_router(review_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}
