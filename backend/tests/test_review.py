import pytest
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timedelta

@pytest.fixture
async def auth_token(client):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/auth/token",
            data={"username": "reviewuser", "password": "pass"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
    return resp.json()["access_token"]

@pytest.mark.asyncio
async def test_schedule_and_due(client, auth_token):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Schedule
        res = await ac.post(
            "/review/LC-1/schedule",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["interval_days"] == 3
        
        # Check due (should be empty since it's due in 3 days)
        res_due = await ac.get("/review/due", headers={"Authorization": f"Bearer {auth_token}"})
        assert len(res_due.json()) == 0

@pytest.mark.asyncio
async def test_review_complete_sm2(client, auth_token):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Schedule
        await ac.post("/review/LC-2/schedule", headers={"Authorization": f"Bearer {auth_token}"})
        
        # Complete with q=3 (pass)
        res1 = await ac.post(
            "/review/LC-2/complete",
            json={"quality": 3},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        data1 = res1.json()
        assert data1["repetition_count"] == 1
        assert data1["interval_days"] == 3
        
        # Complete again with q=5 (easy)
        res2 = await ac.post(
            "/review/LC-2/complete",
            json={"quality": 5},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        data2 = res2.json()
        assert data2["repetition_count"] == 2
        assert data2["interval_days"] == 7
        
        # Complete with q=1 (fail)
        res3 = await ac.post(
            "/review/LC-2/complete",
            json={"quality": 1},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        data3 = res3.json()
        assert data3["repetition_count"] == 1 # Since it was reset, then +=1
        assert data3["interval_days"] == 1
