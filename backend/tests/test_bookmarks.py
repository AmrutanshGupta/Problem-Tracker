def test_add_bookmark(client):
    # First login to get token
    login_response = client.post(
        "/auth/token",
        data={"username": "userA", "password": "password"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Add bookmark
    response = client.post(
        "/bookmarks",
        json={
            "problem_id": "leetcode-1",
            "platform": "leetcode",
            "title": "Two Sum",
            "url": "https://leetcode.com/problems/two-sum/"
        },
        headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["problem_id"] == "leetcode-1"
    assert data["is_active"] == 1

def test_add_duplicate_bookmark_idempotent(client):
    # Login
    login_response = client.post("/auth/token", data={"username": "userA", "password": "p"})
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    payload = {
        "problem_id": "leetcode-1",
        "platform": "leetcode",
        "title": "Two Sum",
        "url": "https://leetcode.com/problems/two-sum/"
    }

    # First add
    client.post("/bookmarks", json=payload, headers=headers)
    # Second add
    response = client.post("/bookmarks", json=payload, headers=headers)
    assert response.status_code == 200
    
    # Verify only one bookmark exists
    get_response = client.get("/bookmarks", headers=headers)
    assert len(get_response.json()) == 1

def test_cross_user_isolation(client):
    # User A adds a bookmark
    token_a = client.post("/auth/token", data={"username": "userA", "password": "p"}).json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    client.post("/bookmarks", json={
        "problem_id": "leetcode-1",
        "platform": "leetcode",
        "title": "Two Sum",
        "url": "https://leetcode.com/problems/two-sum/"
    }, headers=headers_a)

    # User B should not see User A's bookmark
    token_b = client.post("/auth/token", data={"username": "userB", "password": "p"}).json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}
    response_b = client.get("/bookmarks", headers=headers_b)
    assert response_b.status_code == 200
    assert len(response_b.json()) == 0

def test_delete_bookmark(client):
    token = client.post("/auth/token", data={"username": "userA", "password": "p"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    client.post("/bookmarks", json={
        "problem_id": "leetcode-1",
        "platform": "leetcode",
        "title": "Two Sum",
        "url": "https://leetcode.com/problems/two-sum/"
    }, headers=headers)

    # Delete
    del_res = client.delete("/bookmarks/leetcode-1", headers=headers)
    assert del_res.status_code == 200

    # Ensure it doesn't show up in GET
    get_res = client.get("/bookmarks", headers=headers)
    assert len(get_res.json()) == 0
