def test_login_for_access_token(client):
    response = client.post(
        "/auth/token",
        data={"username": "testuser", "password": "testpassword"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"

def test_login_invalid_credentials(client):
    response = client.post(
        "/auth/token",
        data={"username": "", "password": "testpassword"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert response.status_code == 422 # FastAPI form validation error for missing field, or 400 in custom logic
