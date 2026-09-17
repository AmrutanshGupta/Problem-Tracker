import pytest
from httpx import AsyncClient, ASGITransport

@pytest.fixture
async def auth_token(client):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/auth/token",
            data={"username": "snapuser", "password": "pass"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
    return resp.json()["access_token"]

@pytest.mark.asyncio
async def test_save_snapshot_and_dedupe(client, auth_token):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # First save
        res1 = await ac.post(
            "/snapshots",
            json={"problem_id": "LC-1", "language": "python", "code_text": "print('hello')"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert res1.status_code == 200
        data1 = res1.json()
        
        # Second save (Identical code)
        res2 = await ac.post(
            "/snapshots",
            json={"problem_id": "LC-1", "language": "python", "code_text": "print('hello')"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert res2.status_code == 200
        data2 = res2.json()
        
        # Should return the exact same snapshot ID
        assert data1["id"] == data2["id"]
        
        # Third save (Different code)
        res3 = await ac.post(
            "/snapshots",
            json={"problem_id": "LC-1", "language": "python", "code_text": "print('world')"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        data3 = res3.json()
        assert data1["id"] != data3["id"]

@pytest.mark.asyncio
async def test_get_snapshots(client, auth_token):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Save a couple of snapshots
        await ac.post("/snapshots", json={"problem_id": "LC-2", "language": "python", "code_text": "a=1"}, headers={"Authorization": f"Bearer {auth_token}"})
        await ac.post("/snapshots", json={"problem_id": "LC-2", "language": "python", "code_text": "a=2"}, headers={"Authorization": f"Bearer {auth_token}"})
        
        res = await ac.get("/snapshots/LC-2", headers={"Authorization": f"Bearer {auth_token}"})
        data = res.json()
        assert len(data) == 2
        assert data[0]["code_text"] == "a=1"
        assert data[1]["code_text"] == "a=2"
