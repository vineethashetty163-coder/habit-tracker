from datetime import date, timedelta

from app.db.models import HabitLog


def _register_and_get_headers(client, email="alice@example.com"):
    response = client.post(
        "/auth/register", json={"email": email, "password": "supersecret123"}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_and_list_habit(client):
    headers = _register_and_get_headers(client)
    create_response = client.post(
        "/habits", json={"name": "Read", "description": "30 min"}, headers=headers
    )
    assert create_response.status_code == 201
    body = create_response.json()
    assert body["name"] == "Read"
    assert body["current_streak"] == 0
    assert body["week_completed_count"] == 0
    assert body["week_goal"] == 7

    list_response = client.get("/habits", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


def test_habits_require_auth(client):
    response = client.get("/habits")
    assert response.status_code == 401


def test_update_habit(client):
    headers = _register_and_get_headers(client)
    habit_id = client.post("/habits", json={"name": "Read"}, headers=headers).json()["id"]
    response = client.put(f"/habits/{habit_id}", json={"name": "Read more"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Read more"


def test_delete_habit(client):
    headers = _register_and_get_headers(client)
    habit_id = client.post("/habits", json={"name": "Read"}, headers=headers).json()["id"]
    delete_response = client.delete(f"/habits/{habit_id}", headers=headers)
    assert delete_response.status_code == 204

    list_response = client.get("/habits", headers=headers)
    assert list_response.json() == []


def test_toggle_complete_marks_and_unmarks(client):
    headers = _register_and_get_headers(client)
    habit_id = client.post("/habits", json={"name": "Read"}, headers=headers).json()["id"]

    complete_response = client.post(f"/habits/{habit_id}/complete", headers=headers)
    assert complete_response.json()["current_streak"] == 1

    uncomplete_response = client.post(f"/habits/{habit_id}/complete", headers=headers)
    assert uncomplete_response.json()["current_streak"] == 0


def test_cannot_access_or_modify_another_users_habit(client):
    alice_headers = _register_and_get_headers(client, email="alice@example.com")
    bob_headers = _register_and_get_headers(client, email="bob@example.com")

    alice_habit_id = client.post(
        "/habits", json={"name": "Alice's habit"}, headers=alice_headers
    ).json()["id"]

    update_response = client.put(
        f"/habits/{alice_habit_id}", json={"name": "Hacked"}, headers=bob_headers
    )
    assert update_response.status_code == 404

    delete_response = client.delete(f"/habits/{alice_habit_id}", headers=bob_headers)
    assert delete_response.status_code == 404

    complete_response = client.post(f"/habits/{alice_habit_id}/complete", headers=bob_headers)
    assert complete_response.status_code == 404

    alice_list = client.get("/habits", headers=alice_headers).json()
    assert alice_list[0]["name"] == "Alice's habit"


def test_streak_reflects_seeded_historical_logs(client, db_session):
    headers = _register_and_get_headers(client)
    habit_id = client.post("/habits", json={"name": "Read"}, headers=headers).json()["id"]

    today = date.today()
    for offset in range(3):  # today, yesterday, day before yesterday
        db_session.add(HabitLog(habit_id=habit_id, completed_date=today - timedelta(days=offset)))
    db_session.commit()

    response = client.get("/habits", headers=headers)
    assert response.json()[0]["current_streak"] == 3
    assert response.json()[0]["week_completed_count"] == 3


def test_week_completed_count_ignores_completions_older_than_a_week(client, db_session):
    headers = _register_and_get_headers(client)
    habit_id = client.post("/habits", json={"name": "Read"}, headers=headers).json()["id"]

    today = date.today()
    db_session.add(HabitLog(habit_id=habit_id, completed_date=today))
    db_session.add(HabitLog(habit_id=habit_id, completed_date=today - timedelta(days=10)))
    db_session.commit()

    response = client.get("/habits", headers=headers)
    assert response.json()[0]["week_completed_count"] == 1
