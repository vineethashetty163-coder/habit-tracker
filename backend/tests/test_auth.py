from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import settings
from app.db.models import User


def register(client, email="alice@example.com", password="supersecret123"):
    return client.post("/auth/register", json={"email": email, "password": password})


# ---- Register ----


def test_register_success(client):
    response = register(client)
    assert response.status_code == 201
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_register_duplicate_email_rejected(client):
    register(client)
    response = register(client)
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


def test_register_invalid_email_rejected(client):
    response = client.post(
        "/auth/register", json={"email": "not-an-email", "password": "supersecret123"}
    )
    assert response.status_code == 422


def test_register_missing_password_rejected(client):
    response = client.post("/auth/register", json={"email": "alice@example.com"})
    assert response.status_code == 422


def test_password_never_stored_in_plaintext(client, db_session):
    register(client)
    user = db_session.query(User).filter(User.email == "alice@example.com").first()
    assert user.hashed_password != "supersecret123"
    assert user.hashed_password.startswith("$2b$")


# ---- Login ----


def test_login_success(client):
    register(client)
    response = client.post(
        "/auth/login", json={"email": "alice@example.com", "password": "supersecret123"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_wrong_password_rejected(client):
    register(client)
    response = client.post(
        "/auth/login", json={"email": "alice@example.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"


def test_login_nonexistent_email_gives_same_error_as_wrong_password(client):
    register(client)
    wrong_password_response = client.post(
        "/auth/login", json={"email": "alice@example.com", "password": "wrongpassword"}
    )
    nonexistent_email_response = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "whatever"}
    )
    assert nonexistent_email_response.status_code == wrong_password_response.status_code == 401
    assert nonexistent_email_response.json()["detail"] == wrong_password_response.json()["detail"]


# ---- Protected endpoint (/auth/me) ----


def test_me_without_token_rejected(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_with_valid_token_returns_user_without_password(client):
    register(client)
    login_response = client.post(
        "/auth/login", json={"email": "alice@example.com", "password": "supersecret123"}
    )
    token = login_response.json()["access_token"]

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "alice@example.com"
    assert "hashed_password" not in body
    assert "password" not in body


def test_me_with_garbage_token_rejected(client):
    response = client.get("/auth/me", headers={"Authorization": "Bearer not.a.valid.token"})
    assert response.status_code == 401


def test_me_with_expired_token_rejected(client):
    register(client)
    expired_payload = {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}
    expired_token = jwt.encode(expired_payload, settings.secret_key, algorithm=settings.algorithm)

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == 401


def test_me_with_tampered_token_rejected(client):
    token = register(client).json()["access_token"]
    header, payload, signature = token.split(".")
    mid = len(payload) // 2
    tampered_char = "A" if payload[mid] != "A" else "B"
    tampered_payload = payload[:mid] + tampered_char + payload[mid + 1 :]
    tampered_token = f"{header}.{tampered_payload}.{signature}"

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {tampered_token}"})
    assert response.status_code == 401
