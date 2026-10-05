"""
Test fixtures for the Problem Tracker backend.

Key insight: SQLite in-memory databases are connection-scoped by default.
Each new connection gets a fresh empty database, so patching the engine URL
is not sufficient — every call to SessionLocal() would open a new, empty DB.

The fix: use StaticPool to force SQLAlchemy to reuse the same underlying
connection for all sessions, so the tables created once are visible everywhere.

This fixture patches:
  1. app.db.session.engine       → startup health-check uses test engine
  2. app.db.session.SessionLocal → production get_db uses test sessions
  3. app.analytics.jobs.SessionLocal → background worker uses test sessions
  4. FastAPI get_db override     → request handlers use test sessions
"""

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

import app.db.session as db_session_module
import app.analytics.jobs as analytics_jobs_module
from app.main import app
from app.db.session import get_db
from app.db.models import Base


@pytest.fixture(scope="function")
def client():
    """
    Yield a TestClient backed by a fully isolated in-memory SQLite database.

    Uses StaticPool so all sessions share the same connection and can see
    the tables created during setup.
    """
    # ── 1. Build the isolated test engine with a shared connection pool ──────
    test_engine = create_engine(
        "sqlite://",          # pure in-memory, no file
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # reuse the same connection — all sessions see same DB
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    # ── 2. Create all tables on the shared connection ────────────────────────
    Base.metadata.create_all(bind=test_engine)

    # ── 3. Monkeypatch every module-level reference to engine / SessionLocal ─
    original_engine = db_session_module.engine
    original_sl = db_session_module.SessionLocal
    original_jobs_sl = analytics_jobs_module.SessionLocal

    db_session_module.engine = test_engine
    db_session_module.SessionLocal = TestingSessionLocal
    analytics_jobs_module.SessionLocal = TestingSessionLocal

    # ── 4. Override FastAPI's get_db dependency ──────────────────────────────
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    # ── 5. Run the test ──────────────────────────────────────────────────────
    with TestClient(app) as c:
        yield c

    # ── 6. Teardown ──────────────────────────────────────────────────────────
    app.dependency_overrides.clear()
    analytics_jobs_module.SessionLocal = original_jobs_sl
    db_session_module.SessionLocal = original_sl
    db_session_module.engine = original_engine
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()
