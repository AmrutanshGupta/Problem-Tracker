"""Tests for the bookmarks API."""


def register_login(client, username="userA", password="password123"):
    """Register user and return auth headers."""
    client.post("/auth/register", data={"username": username, "password": password})
    token = client.post("/auth/token", data={"username": username, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


BOOKMARK_PAYLOAD = {
    "problem_id": "leetcode-1",
    "platform": "leetcode",
    "title": "Two Sum",
    "url": "https://leetcode.com/problems/two-sum/",
}


def test_add_bookmark(client):
    headers = register_login(client)
    response = client.post("/bookmarks", json=BOOKMARK_PAYLOAD, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["problem_id"] == "leetcode-1"
    assert data["is_active"] == 1


def test_add_duplicate_bookmark_idempotent(client):
    headers = register_login(client)
    client.post("/bookmarks", json=BOOKMARK_PAYLOAD, headers=headers)
    response = client.post("/bookmarks", json=BOOKMARK_PAYLOAD, headers=headers)
    assert response.status_code == 200
    # Only one bookmark should exist
    get_response = client.get("/bookmarks", headers=headers)
    assert len(get_response.json()) == 1


def test_cross_user_isolation(client):
    headers_a = register_login(client, "userA", "password123")
    client.post("/bookmarks", json=BOOKMARK_PAYLOAD, headers=headers_a)

    # User B should have no bookmarks
    headers_b = register_login(client, "userB", "password456")
    response_b = client.get("/bookmarks", headers=headers_b)
    assert response_b.status_code == 200
    assert len(response_b.json()) == 0


def test_delete_bookmark(client):
    headers = register_login(client)
    client.post("/bookmarks", json=BOOKMARK_PAYLOAD, headers=headers)

    del_res = client.delete("/bookmarks/leetcode-1", headers=headers)
    assert del_res.status_code == 200

    get_res = client.get("/bookmarks", headers=headers)
    assert len(get_res.json()) == 0


def test_get_bookmarks_returns_only_active(client):
    headers = register_login(client)
    client.post("/bookmarks", json=BOOKMARK_PAYLOAD, headers=headers)
    # Add a second bookmark
    client.post("/bookmarks", json={**BOOKMARK_PAYLOAD, "problem_id": "leetcode-2", "title": "Add Two Numbers"}, headers=headers)
    client.delete("/bookmarks/leetcode-1", headers=headers)
    bookmarks = client.get("/bookmarks", headers=headers).json()
    ids = [b["problem_id"] for b in bookmarks]
    assert "leetcode-2" in ids
    assert "leetcode-1" not in ids
