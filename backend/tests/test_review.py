"""
Tests for the SM2 spaced-repetition review router.

Canonical SM2 expected values used throughout:
  - Initial state : EF=2.5, repetitions=0, interval=1
  - q >= 3 (success):
      rep=0 → interval=1  (first success still schedules for tomorrow)
      rep=1 → interval=6
      rep=2 → interval=round(6 × EF)
  - q < 3  (failure): interval resets to 1, repetitions reset to 0

EF formula: EF_new = max(1.3, EF + 0.1 - (5-q)*(0.08 + (5-q)*0.02))
  q=5 → EF += +0.10  → 2.5 + 0.10 = 2.60
  q=4 → EF += +0.00  → 2.5 + 0.00 = 2.50
  q=3 → EF += -0.14  → 2.5 - 0.14 = 2.36
  q=2 → EF += -0.32  → 2.5 - 0.32 = 2.18  (failure)
  q=1 → EF += -0.54  → 2.5 - 0.54 = 1.96  (failure)
  q=0 → EF += -0.80  → 2.5 - 0.80 = 1.70  (failure)
"""

import pytest
import math


# ---------------------------------------------------------------------------
# Helper — register + get token
# ---------------------------------------------------------------------------

def get_token(client, username="testuser", password="secret123"):
    client.post("/auth/register", data={"username": username, "password": password})
    resp = client.post("/auth/token", data={"username": username, "password": password})
    return resp.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def schedule(client, headers, problem_id="lc-1"):
    return client.post(f"/review/{problem_id}/schedule", headers=headers)


def complete(client, headers, quality, problem_id="lc-1"):
    return client.post(f"/review/{problem_id}/complete", json={"quality": quality}, headers=headers)


# ---------------------------------------------------------------------------
# Scheduling tests
# ---------------------------------------------------------------------------

class TestScheduleReview:
    def test_initial_state_is_correct(self, client):
        """Brand-new card must have SM2 initial state: EF=2.5, reps=0, interval=1."""
        token = get_token(client)
        res = schedule(client, auth(token))
        assert res.status_code == 200
        d = res.json()
        assert d["ease_factor"] == 2.5
        assert d["repetitions"] == 0
        assert d["interval_days"] == 1

    def test_idempotent_if_already_scheduled(self, client):
        """Calling schedule twice must return the same record without resetting it."""
        token = get_token(client)
        headers = auth(token)
        first = schedule(client, headers).json()
        second = schedule(client, headers).json()
        assert first["due_at"] == second["due_at"]
        assert first["ease_factor"] == second["ease_factor"]

    def test_different_problems_are_independent(self, client):
        """Two different problem_ids create two independent schedules."""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers, "lc-1")
        schedule(client, headers, "lc-2")
        complete(client, headers, quality=5, problem_id="lc-1")
        # lc-2 should be untouched
        res = client.get("/review/all", headers=headers).json()
        lc2 = next(r for r in res if r["problem_id"] == "lc-2")
        assert lc2["repetitions"] == 0

    def test_different_users_are_isolated(self, client):
        """Two users must not see each other's review data."""
        t1 = get_token(client, "alice", "password1")
        t2 = get_token(client, "bob",   "password2")
        schedule(client, auth(t1), "lc-1")
        # Bob schedules nothing — his due list must be empty
        res = client.get("/review/due", headers=auth(t2)).json()
        assert res == []


# ---------------------------------------------------------------------------
# Quality score validation
# ---------------------------------------------------------------------------

class TestQualityValidation:
    def test_quality_below_0_rejected(self, client):
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        res = complete(client, headers, quality=-1)
        assert res.status_code == 422  # Pydantic validation error

    def test_quality_above_5_rejected(self, client):
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        res = complete(client, headers, quality=6)
        assert res.status_code == 422

    def test_quality_0_accepted(self, client):
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        assert complete(client, headers, quality=0).status_code == 200

    def test_quality_5_accepted(self, client):
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        assert complete(client, headers, quality=5).status_code == 200

    def test_complete_without_schedule_returns_404(self, client):
        token = get_token(client)
        res = complete(client, auth(token), quality=4, problem_id="unknown-problem")
        assert res.status_code == 404


# ---------------------------------------------------------------------------
# SM2 algorithm correctness
# ---------------------------------------------------------------------------

class TestSM2Algorithm:
    """
    Verify every part of the SM2 computation against hand-calculated values.
    """

    # --- Failure path (q < 3) ---

    def test_failure_resets_repetitions_to_0(self, client):
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        # First push to rep=1
        complete(client, headers, quality=4)
        # Now fail
        d = complete(client, headers, quality=2).json()
        assert d["repetitions"] == 0, "Failure must reset repetitions to 0"

    def test_failure_resets_interval_to_1(self, client):
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        complete(client, headers, quality=5)  # interval → 1 (rep was 0)
        complete(client, headers, quality=5)  # interval → 6
        d = complete(client, headers, quality=1).json()  # failure
        assert d["interval_days"] == 1, "Failure must reset interval to 1"

    def test_failure_still_updates_ease_factor(self, client):
        """EF is updated even on failure per SM2 spec."""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        # q=2 failure: EF_new = 2.5 + 0.1 - 3*(0.08 + 3*0.02) = 2.5 - 0.32 = 2.18
        d = complete(client, headers, quality=2).json()
        assert abs(d["ease_factor"] - 2.18) < 0.001

    def test_q0_failure_ease_factor(self, client):
        """q=0: EF_new = 2.5 - 0.80 = 1.70"""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        d = complete(client, headers, quality=0).json()
        assert abs(d["ease_factor"] - 1.70) < 0.001
        assert d["repetitions"] == 0
        assert d["interval_days"] == 1

    def test_q1_failure_ease_factor(self, client):
        """q=1: EF_new = 2.5 - 0.54 = 1.96"""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        d = complete(client, headers, quality=1).json()
        assert abs(d["ease_factor"] - 1.96) < 0.001
        assert d["repetitions"] == 0
        assert d["interval_days"] == 1

    # --- Success path (q >= 3) ---

    def test_first_success_interval_is_1(self, client):
        """rep=0, q>=3 → interval=1, repetitions becomes 1."""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        d = complete(client, headers, quality=4).json()
        assert d["interval_days"] == 1
        assert d["repetitions"] == 1

    def test_second_success_interval_is_6(self, client):
        """rep=1, q>=3 → interval=6, repetitions becomes 2."""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        complete(client, headers, quality=4)       # rep 0→1, interval=1
        d = complete(client, headers, quality=4).json()  # rep 1→2, interval=6
        assert d["interval_days"] == 6
        assert d["repetitions"] == 2

    def test_third_success_uses_ef_multiplier(self, client):
        """rep=2, q>=3 → interval=round(prev_interval × EF)."""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        complete(client, headers, quality=4)  # rep 0→1, EF stays 2.5
        complete(client, headers, quality=4)  # rep 1→2, interval=6, EF stays 2.5
        d = complete(client, headers, quality=4).json()  # rep 2→3, interval=round(6*2.5)=15
        assert d["interval_days"] == round(6 * 2.5)   # = 15
        assert d["repetitions"] == 3

    def test_q5_ease_factor_increases(self, client):
        """q=5: EF_new = 2.5 + 0.10 = 2.60"""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        d = complete(client, headers, quality=5).json()
        assert abs(d["ease_factor"] - 2.60) < 0.001

    def test_q4_ease_factor_unchanged(self, client):
        """q=4: EF_new = 2.5 + 0.0 = 2.50 (unchanged)"""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        d = complete(client, headers, quality=4).json()
        assert abs(d["ease_factor"] - 2.50) < 0.001

    def test_q3_ease_factor_decreases(self, client):
        """q=3: EF_new = 2.5 - 0.14 = 2.36"""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        d = complete(client, headers, quality=3).json()
        assert abs(d["ease_factor"] - 2.36) < 0.001

    def test_ease_factor_never_drops_below_1_3(self, client):
        """EF has a hard floor of 1.3 regardless of repeated failures."""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        # q=0 gives the largest EF drop. Run it many times.
        for _ in range(10):
            d = complete(client, headers, quality=0).json()
        assert d["ease_factor"] >= 1.3

    def test_full_sm2_sequence_q5(self, client):
        """
        Simulate a realistic run of all perfect recalls (q=5):
          Schedule → rep=0, I=1, EF=2.5
          Review q=5 → rep=1, I=1,  EF=2.6
          Review q=5 → rep=2, I=6,  EF=2.7
          Review q=5 → rep=3, I=round(6*2.7)=16, EF=2.8
          Review q=5 → rep=4, I=round(16*2.8)=45, EF=2.9 (capped at some max? No, no max)
        """
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)

        # Step 1: rep=0 → success
        d = complete(client, headers, quality=5).json()
        assert d["repetitions"] == 1
        assert d["interval_days"] == 1
        assert abs(d["ease_factor"] - 2.60) < 0.001

        # Step 2: rep=1 → success
        d = complete(client, headers, quality=5).json()
        assert d["repetitions"] == 2
        assert d["interval_days"] == 6
        assert abs(d["ease_factor"] - 2.70) < 0.001

        # Step 3: rep=2 → success, interval = round(6 * 2.70) = 16
        d = complete(client, headers, quality=5).json()
        assert d["repetitions"] == 3
        assert d["interval_days"] == round(6 * 2.70)   # 16
        assert abs(d["ease_factor"] - 2.80) < 0.001

        # Step 4: rep=3 → success, interval = round(16 * 2.80) = 45
        d = complete(client, headers, quality=5).json()
        assert d["repetitions"] == 4
        assert d["interval_days"] == round(round(6 * 2.70) * 2.80)  # round(16*2.8)=45
        assert abs(d["ease_factor"] - 2.90) < 0.001

    def test_failure_after_multiple_successes_fully_resets(self, client):
        """After reaching rep=3, a failure must bring reps+interval back to 0/1."""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        complete(client, headers, quality=5)
        complete(client, headers, quality=5)
        complete(client, headers, quality=5)
        d = complete(client, headers, quality=0).json()
        assert d["repetitions"] == 0
        assert d["interval_days"] == 1

    def test_recovery_after_failure_restarts_sm2(self, client):
        """After a failure the next success should restart from rep=0 → interval=1."""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        complete(client, headers, quality=5)  # success
        complete(client, headers, quality=0)  # failure → reps=0
        d = complete(client, headers, quality=5).json()  # success from rep=0
        assert d["repetitions"] == 1
        assert d["interval_days"] == 1


# ---------------------------------------------------------------------------
# Due-list tests
# ---------------------------------------------------------------------------

class TestDueList:
    def test_freshly_scheduled_card_is_not_due(self, client):
        """A card scheduled now is due in 1 day — should NOT appear in /due."""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        res = client.get("/review/due", headers=headers)
        assert res.status_code == 200
        assert res.json() == []

    def test_all_returns_all_cards(self, client):
        """GET /review/all must return all cards regardless of due date."""
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers, "lc-1")
        schedule(client, headers, "lc-2")
        res = client.get("/review/all", headers=headers).json()
        assert len(res) == 2

    def test_due_list_user_isolated(self, client):
        """User B cannot see User A's due cards."""
        t1 = get_token(client, "alice2", "password1")
        t2 = get_token(client, "bob2",   "password2")
        schedule(client, auth(t1))
        assert client.get("/review/due", headers=auth(t2)).json() == []


# ---------------------------------------------------------------------------
# Delete tests
# ---------------------------------------------------------------------------

class TestDeleteReview:
    def test_delete_removes_card(self, client):
        token = get_token(client)
        headers = auth(token)
        schedule(client, headers)
        res = client.delete("/review/lc-1/schedule", headers=headers)
        assert res.status_code == 204
        assert client.get("/review/all", headers=headers).json() == []

    def test_delete_nonexistent_returns_404(self, client):
        token = get_token(client)
        res = client.delete("/review/nonexistent/schedule", headers=auth(token))
        assert res.status_code == 404
