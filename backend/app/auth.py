"""Authentication, and the only component that knows there is more than one Finisher.

- Sign-in: check a username and password against the accounts database.
- Token: a signed JWT (HS256) carrying only the user id and an expiry (D16).
- `current_user`: turns a request's token into the user and their Finisher, or refuses with 401.
- `finisher_db`: hands the request a connection to that user's Finisher database.

Isolation rule (D17): the Finisher always comes from the signed-in user, looked
up in the accounts database. Nothing in the path, query, headers or body of a
request can name a Finisher. `open_finisher_db` is the one function that picks
a database file.
"""

import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import config
from app.db import accounts_db_path, connect, finisher_db_path
from app.errors import not_authenticated
from app.security import hash_password, verify_password

_ALGORITHM = "HS256"

# Checked when the username is unknown, so that an unknown user takes as long
# to refuse as a wrong password.
_DUMMY_HASH = hash_password("no such user")


@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str
    finisher_id: int
    finisher_name: str


_USER_QUERY = """
    SELECT u.id, u.username, u.password_hash, f.id AS finisher_id, f.name AS finisher_name
    FROM app_user u JOIN finisher f ON f.id = u.finisher_id
"""


def _to_user(row: sqlite3.Row) -> CurrentUser:
    return CurrentUser(row["id"], row["username"], row["finisher_id"], row["finisher_name"])


def check_credentials(data_dir: Path, username: str, password: str) -> CurrentUser | None:
    accounts = connect(accounts_db_path(data_dir))
    try:
        row = accounts.execute(_USER_QUERY + "WHERE u.username = ?", (username,)).fetchone()
    finally:
        accounts.close()
    if row is None:
        verify_password(password, _DUMMY_HASH)
        return None
    return _to_user(row) if verify_password(password, row["password_hash"]) else None


def find_user(data_dir: Path, user_id: int) -> CurrentUser | None:
    accounts = connect(accounts_db_path(data_dir))
    try:
        row = accounts.execute(_USER_QUERY + "WHERE u.id = ?", (user_id,)).fetchone()
    finally:
        accounts.close()
    return _to_user(row) if row else None


def create_token(user_id: int, secret: str, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    claims = {"sub": str(user_id), "iat": now, "exp": now + config.TOKEN_LIFETIME}
    return jwt.encode(claims, secret, algorithm=_ALGORITHM)


def read_token(token: str, secret: str) -> int | None:
    """The user id in a valid, unexpired token signed by us. Otherwise None."""
    try:
        claims = jwt.decode(token, secret, algorithms=[_ALGORITHM], options={"require": ["exp", "sub"]})
        return int(claims["sub"])
    except (jwt.InvalidTokenError, ValueError):
        return None


def open_finisher_db(data_dir: Path, user: CurrentUser) -> sqlite3.Connection:
    """Pick the database for a user. The only place a Finisher database is chosen.

    The file name comes from the Finisher id stored in the accounts database
    for this user, never from the request.
    """
    return connect(finisher_db_path(data_dir, user.finisher_id))


# --- FastAPI dependencies ---

# auto_error=False: we answer a missing token ourselves, in the API's error shape.
_bearer = HTTPBearer(auto_error=False, description="The token returned by POST /api/auth/login")


def current_user(
    request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)
) -> CurrentUser:
    if credentials is None:
        raise not_authenticated()
    user_id = read_token(credentials.credentials, request.app.state.secret)
    user = find_user(request.app.state.data_dir, user_id) if user_id is not None else None
    if user is None:
        raise not_authenticated()
    return user


def finisher_db(request: Request, user: CurrentUser = Depends(current_user)) -> Iterator[sqlite3.Connection]:
    """A connection to the signed-in user's Finisher database, closed after the request."""
    db = open_finisher_db(request.app.state.data_dir, user)
    try:
        yield db
    finally:
        db.close()
