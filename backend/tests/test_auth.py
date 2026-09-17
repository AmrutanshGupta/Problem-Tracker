import pytest
from httpx import AsyncClient, ASGITransport

@pytest.mark.asyncio
async def test_login_for_access_token(client):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/auth/token",
            data={"username": "testuser", "password": "password123"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
    
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

@pytest.mark.asyncio
async def test_login_missing_credentials(client):
    transport = ASGITransport(app=client)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/auth/token",
            data={"username": "", "password": ""},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
    
    # FastAPI's OAuth2PasswordRequestForm validation will return 400 or 422
    assert response.status_code in (400, 422)
