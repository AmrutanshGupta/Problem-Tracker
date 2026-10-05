"""Tests for authentication endpoints."""


def register_and_login(client, username, password):
    """Register a user then return their access token."""
    client.post("/auth/register", data={"username": username, "password": password})
    resp = client.post("/auth/token", data={"username": username, "password": password})
    return resp


def test_login_for_access_token(client):
    resp = register_and_login(client, "testuser", "testpassword")
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_credentials(client):
    response = client.post(
        "/auth/token",
        data={"username": "", "password": "testpassword"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    # FastAPI form validation returns 422, custom logic returns 400
    assert response.status_code in (400, 422)


def test_register_duplicate_username(client):
    client.post("/auth/register", data={"username": "dupeuser", "password": "password1"})
    resp = client.post("/auth/register", data={"username": "dupeuser", "password": "password2"})
    assert resp.status_code == 409


def test_register_password_too_short(client):
    resp = client.post("/auth/register", data={"username": "newuser", "password": "abc"})
    assert resp.status_code == 400


def test_me_endpoint(client):
    client.post("/auth/register", data={"username": "meuser", "password": "password1"})
    token = client.post("/auth/token", data={"username": "meuser", "password": "password1"}).json()["access_token"]
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "meuser"
