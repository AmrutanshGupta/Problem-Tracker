import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import SessionLocal
from app.logging_config import logger

async def refresh_user_daily_activity():
    """
    Simulates a Materialized View refresh by aggregating EventLog into UserDailyActivity.
    Runs periodically in the background.
    """
    logger.info("Starting refresh of user_daily_activity...")
    db = SessionLocal()
    try:
        db.execute(text("DELETE FROM user_daily_activity"))
        
        db.execute(text("""
            INSERT INTO user_daily_activity (user_id, date, bookmarks_added, reviews_completed, last_updated)
            SELECT 
                user_id, 
                date(server_timestamp) as activity_date,
                COUNT(event_id) as b_added,
                0 as r_completed,
                CURRENT_TIMESTAMP
            FROM event_log
            WHERE event_type = 'BookmarkAdded'
            GROUP BY user_id, activity_date
        """))
        
        db.execute(text("""
            INSERT INTO user_daily_activity (user_id, date, bookmarks_added, reviews_completed, last_updated)
            SELECT 
                user_id, 
                date(server_timestamp) as activity_date,
                0 as b_added,
                COUNT(event_id) as r_completed,
                CURRENT_TIMESTAMP
            FROM event_log
            WHERE event_type = 'ReviewCompleted'
            GROUP BY user_id, activity_date
            ON CONFLICT(user_id, date) DO UPDATE SET
                reviews_completed = excluded.reviews_completed,
                last_updated = excluded.last_updated
        """))
        
        db.commit()
        logger.info("Successfully refreshed user_daily_activity")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to refresh user_daily_activity: {e}")
    finally:
        db.close()

async def analytics_worker():
    while True:
        await refresh_user_daily_activity()
        await asyncio.sleep(60)

