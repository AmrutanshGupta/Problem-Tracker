import pytest
from httpx import AsyncClient, ASGITransport

@pytest.fixture
async def auth_token(client):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/auth/token",
            data={"username": "testuser", "password": "pass"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
    return resp.json()["access_token"]

@pytest.fixture
async def auth_token_user2(client):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/auth/token",
            data={"username": "user2", "password": "pass"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
    return resp.json()["access_token"]

@pytest.mark.asyncio
async def test_add_bookmark(client, auth_token):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/bookmarks",
            json={"problem_id": "LC-1", "platform": "LeetCode", "title": "Two Sum", "url": "url"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["problem_id"] == "LC-1"

@pytest.mark.asyncio
async def test_get_bookmarks_isolation(client, auth_token, auth_token_user2):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # User 1 adds LC-1
        await ac.post(
            "/bookmarks",
            json={"problem_id": "LC-1", "platform": "LeetCode", "title": "Two Sum", "url": "url"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # User 2 adds LC-2
        await ac.post(
            "/bookmarks",
            json={"problem_id": "LC-2", "platform": "LeetCode", "title": "Add Two", "url": "url2"},
            headers={"Authorization": f"Bearer {auth_token_user2}"}
        )
        
        # User 1 should only see LC-1
        res1 = await ac.get("/bookmarks", headers={"Authorization": f"Bearer {auth_token}"})
        data1 = res1.json()
        assert len(data1) == 1
        assert data1[0]["problem_id"] == "LC-1"
        
        # User 2 should only see LC-2
        res2 = await ac.get("/bookmarks", headers={"Authorization": f"Bearer {auth_token_user2}"})
        data2 = res2.json()
        assert len(data2) == 1
        assert data2[0]["problem_id"] == "LC-2"

@pytest.mark.asyncio
async def test_delete_bookmark(client, auth_token):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create LC-1
        await ac.post(
            "/bookmarks",
            json={"problem_id": "LC-1", "platform": "LeetCode", "title": "Two Sum", "url": "url"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # Delete LC-1
        res = await ac.delete("/bookmarks/LC-1", headers={"Authorization": f"Bearer {auth_token}"})
        assert res.status_code == 200
        
        # Ensure it's gone
        res_list = await ac.get("/bookmarks", headers={"Authorization": f"Bearer {auth_token}"})
        assert len(res_list.json()) == 0
