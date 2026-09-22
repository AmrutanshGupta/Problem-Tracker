import pytest

def test_schedule_review(client):
    token = client.post("/auth/token", data={"username": "userA", "password": "p"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    res = client.post("/review/leetcode-1/schedule", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["ease_factor"] == 2.5
    assert data["interval_days"] == 3
    assert data["repetition_count"] == 0

def test_complete_review_q1(client):
    token = client.post("/auth/token", data={"username": "userA", "password": "p"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Schedule
    client.post("/review/leetcode-1/schedule", headers=headers)
    
    # Complete q=1 (fail)
    res = client.post("/review/leetcode-1/complete", json={"quality": 1}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["interval_days"] == 1
    assert data["repetition_count"] == 1

def test_complete_review_q3(client):
    token = client.post("/auth/token", data={"username": "userA", "password": "p"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post("/review/leetcode-1/schedule", headers=headers)
    
    res = client.post("/review/leetcode-1/complete", json={"quality": 3}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["interval_days"] == 3
    assert data["repetition_count"] == 1

def test_complete_review_q5(client):
    token = client.post("/auth/token", data={"username": "userA", "password": "p"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post("/review/leetcode-1/schedule", headers=headers)
    
    # First complete
    res = client.post("/review/leetcode-1/complete", json={"quality": 5}, headers=headers)
    
    # Rep count should now be 1, interval = 3
    assert res.json()["interval_days"] == 3
    
    # Second complete with q=5
    res2 = client.post("/review/leetcode-1/complete", json={"quality": 5}, headers=headers)
    data2 = res2.json()
    assert data2["interval_days"] == 7
    assert data2["repetition_count"] == 2
    
    # Third complete with q=5
    res3 = client.post("/review/leetcode-1/complete", json={"quality": 5}, headers=headers)
    data3 = res3.json()
    assert data3["interval_days"] == round(7 * 2.7)
    assert data3["repetition_count"] == 3

def test_due_reviews(client):
    token = client.post("/auth/token", data={"username": "userA", "password": "p"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Not due yet because due_at is 3 days in future
    client.post("/review/leetcode-1/schedule", headers=headers)
    
    res = client.get("/review/due", headers=headers)
    assert len(res.json()) == 0
