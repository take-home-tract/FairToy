"""Sign-in, tokens, and the function that picks a user's database."""

import sqlite3
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from app import config
from app.auth import CurrentUser, create_token, finisher_db, open_finisher_db, read_token
from app.db import finisher_db_path
from app.main import create_app
from tests.helpers import PASSWORD, SECRET, USERS, sign_in

NOT_AUTHENTICATED = {"error": {"code": "not_authenticated", "message": "Sign in to continue."}}


# --- sign in ---


@pytest.mark.parametrize("username, finisher_id, finisher_name, _code", USERS)
def test_each_seeded_user_signs_in_and_belongs_to_its_finisher(client, username, finisher_id, finisher_name, _code):
    response = client.post("/api/auth/login", json={"username": username, "password": PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["username"] == username
    assert body["finisher"] == {"id": finisher_id, "name": finisher_name}

    me = client.get("/api/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    assert me.json() == {"user": body["user"], "finisher": body["finisher"]}


@pytest.mark.parametrize(
    "username, password",
    [("kestrel-play", "wrong"), ("nobody", PASSWORD), ("", ""), ("KESTREL-PLAY", PASSWORD), ("kestrel-play", "")],
)
def test_wrong_credentials_get_one_message_that_does_not_say_which_part_was_wrong(client, username, password):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 401
    assert response.json() == {"error": {"code": "invalid_credentials", "message": "Wrong username or password."}}


def test_malformed_login_is_a_422_in_the_api_error_shape(client):
    response = client.post("/api/auth/login", json={"username": "kestrel-play"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_unknown_path_uses_the_api_error_shape(client):
    response = client.get("/api/nothing-here")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# --- tokens ---


def _token(claims, secret=SECRET, algorithm="HS256"):
    return jwt.encode(claims, secret, algorithm=algorithm)


def _in(hours):
    return datetime.now(timezone.utc) + timedelta(hours=hours)


BAD_AUTHORIZATION_HEADERS = {
    "no header": None,
    "empty": "",
    "not bearer": "Basic a2VzdHJlbC1wbGF5OnRlc3Q=",
    "bearer without token": "Bearer ",
    "garbage": "Bearer not-a-token",
    "signed with another secret": "Bearer " + _token({"sub": "2", "exp": _in(1)}, secret="another-secret-of-a-decent-length-1234"),
    "expired": "Bearer " + _token({"sub": "2", "exp": _in(-1)}),
    "no expiry": "Bearer " + _token({"sub": "2"}),
    "no user": "Bearer " + _token({"exp": _in(1)}),
    "user that does not exist": "Bearer " + _token({"sub": "999", "exp": _in(1)}),
    "user id is not a number": "Bearer " + _token({"sub": "kestrel-play", "exp": _in(1)}),
    # An unsigned token ("alg": "none") claiming to be user 2.
    "unsigned": "Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIyIiwiZXhwIjo0MTAyNDQ0ODAwfQ.",
}


@pytest.mark.parametrize("header", BAD_AUTHORIZATION_HEADERS.values(), ids=BAD_AUTHORIZATION_HEADERS.keys())
def test_me_refuses_a_missing_or_bad_token(client, header):
    headers = {} if header is None else {"Authorization": header}
    response = client.get("/api/me", headers=headers)
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


def test_a_tampered_token_is_refused(client):
    """Take user 2's real token and change the payload to say user 3, keeping the signature."""
    real = sign_in(client, "kestrel-play")["Authorization"].removeprefix("Bearer ")
    header, _payload, signature = real.split(".")
    forged_payload = _token({"sub": "3", "exp": _in(1)}).split(".")[1]
    response = client.get("/api/me", headers={"Authorization": f"Bearer {header}.{forged_payload}.{signature}"})
    assert response.status_code == 401


def test_token_carries_only_the_user_id_and_expires_after_eight_hours():
    now = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)
    claims = jwt.decode(create_token(2, SECRET, now=now), options={"verify_signature": False})
    assert claims == {"sub": "2", "iat": int(now.timestamp()), "exp": int((now + timedelta(hours=8)).timestamp())}
    assert config.TOKEN_LIFETIME == timedelta(hours=8)


def test_read_token_round_trip():
    assert read_token(create_token(5, SECRET), SECRET) == 5
    assert read_token(create_token(5, SECRET), "another-secret-of-a-decent-length-1234") is None


def test_tokens_stop_working_when_the_secret_changes(data_dir):
    with TestClient(create_app(data_dir=data_dir, secret="first-secret-of-a-decent-length-123456")) as first:
        headers = sign_in(first, "kestrel-play")
        assert first.get("/api/me", headers=headers).status_code == 200
    with TestClient(create_app(data_dir=data_dir, secret="second-secret-of-a-decent-length-12345")) as second:
        assert second.get("/api/me", headers=headers).status_code == 401


def test_without_a_configured_secret_a_random_one_is_made(data_dir, monkeypatch):
    monkeypatch.delenv(config.SECRET_ENV_VAR, raising=False)
    one, two = create_app(data_dir=data_dir), create_app(data_dir=data_dir)
    assert len(one.state.secret) >= 32
    assert one.state.secret != two.state.secret


def test_the_api_does_not_start_without_seeded_databases(tmp_path):
    with pytest.raises(RuntimeError, match="Run the seed first"):
        with TestClient(create_app(data_dir=tmp_path, secret=SECRET)):
            pass
    assert list(tmp_path.iterdir()) == []


# --- picking the database ---


@pytest.mark.parametrize("username, finisher_id, finisher_name, code", USERS)
def test_open_finisher_db_opens_the_users_own_file(data_dir, toy_codes_by_finisher, username, finisher_id, finisher_name, code):
    user = CurrentUser(id=finisher_id, username=username, finisher_id=finisher_id, finisher_name=finisher_name)
    db = open_finisher_db(data_dir, user)
    try:
        opened_file = db.execute("PRAGMA database_list").fetchone()["file"]
        assert opened_file.endswith(f"finisher-{finisher_id}.db")
        assert [r["code"] for r in db.execute("SELECT code FROM toy ORDER BY code")] == toy_codes_by_finisher[code]
    finally:
        db.close()


def test_open_finisher_db_takes_nothing_but_the_user(data_dir):
    """Its only inputs are the data folder (from configuration) and the user (from the token)."""
    import inspect

    assert list(inspect.signature(open_finisher_db).parameters) == ["data_dir", "user"]


@pytest.fixture
def probe_client(app):
    """The real app plus one test-only endpoint that reads through the `finisher_db` dependency."""

    @app.get("/api/_probe/toy-codes")
    def toy_codes(db: sqlite3.Connection = Depends(finisher_db)):
        return [r["code"] for r in db.execute("SELECT code FROM toy ORDER BY code")]

    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize("username, _id, _name, code", USERS)
def test_a_request_reads_only_its_own_finishers_database(probe_client, toy_codes_by_finisher, username, _id, _name, code):
    response = probe_client.get("/api/_probe/toy-codes", headers=sign_in(probe_client, username))
    assert response.status_code == 200
    assert response.json() == toy_codes_by_finisher[code]


def test_nothing_in_the_request_can_steer_it_to_another_finisher(probe_client, toy_codes_by_finisher):
    """Signed in as Kestrel Play (2), ask for Moonpath Brands (3) every way a request can."""
    headers = sign_in(probe_client, "kestrel-play")
    own = toy_codes_by_finisher["FIN-002"]
    attempts = [
        dict(params={"finisher_id": 3, "finisherId": 3, "finisher": "FIN-003"}),
        dict(headers={**headers, "X-Finisher-Id": "3", "Finisher": "3"}),
        dict(cookies={"finisher_id": "3"}),
    ]
    for extra in attempts:
        request = {"headers": headers, **extra}
        cookies = request.pop("cookies", None)
        if cookies:
            probe_client.cookies.update(cookies)
        assert probe_client.get("/api/_probe/toy-codes", **request).json() == own
        me = probe_client.get("/api/me", **request).json()
        assert me["finisher"] == {"id": 2, "name": "Kestrel Play"}


def test_the_probe_refuses_a_request_with_no_token_and_opens_no_database(probe_client):
    response = probe_client.get("/api/_probe/toy-codes")
    assert response.status_code == 401
    assert response.json() == NOT_AUTHENTICATED


def test_finisher_db_path_is_built_from_the_numeric_id_only(data_dir):
    assert finisher_db_path(data_dir, 2) == data_dir / "finisher-2.db"
