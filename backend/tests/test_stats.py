from datetime import date, timedelta

from app.db.models import HabitLog


def _register_and_get_headers(client, email="alice@example.com"):
    response = client.post(
        "/auth/register", json={"email": email, "password": "supersecret123"}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_weekly_stats_empty_when_no_habits(client):
    headers = _register_and_get_headers(client)
    response = client.get("/stats/weekly", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total_completions"] == 0
    assert body["completion_rate"] == 0.0
    assert len(body["daily_completions"]) == 7


def test_weekly_stats_counts_seeded_completions(client, db_session):
    headers = _register_and_get_headers(client)
    habit_id = client.post("/habits", json={"name": "Read"}, headers=headers).json()["id"]

    today = date.today()
    db_session.add(HabitLog(habit_id=habit_id, completed_date=today))
    db_session.add(HabitLog(habit_id=habit_id, completed_date=today - timedelta(days=1)))
    db_session.commit()

    response = client.get("/stats/weekly", headers=headers)
    body = response.json()
    assert body["total_completions"] == 2
    assert body["completion_rate"] == round(2 / 7, 4)


def test_weekly_stats_only_includes_current_user(client):
    alice_headers = _register_and_get_headers(client, email="alice@example.com")
    bob_headers = _register_and_get_headers(client, email="bob@example.com")

    alice_habit_id = client.post(
        "/habits", json={"name": "Alice"}, headers=alice_headers
    ).json()["id"]
    client.post(f"/habits/{alice_habit_id}/complete", headers=alice_headers)

    bob_stats = client.get("/stats/weekly", headers=bob_headers).json()
    assert bob_stats["total_completions"] == 0
