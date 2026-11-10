"""Shared fixtures: the real sample data seeded once, and an API client on top of it."""

import csv

import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import create_app
from app.db import connect, finisher_db_path
from app.seed import seed
from tests.helpers import PASSWORD, SECRET, USERS

@pytest.fixture(scope="session")
def data_dir(tmp_path_factory):
    path = tmp_path_factory.mktemp("api-data")
    seed(config.CSV_DIR, path, PASSWORD)
    return path


@pytest.fixture
def app(data_dir):
    return create_app(data_dir=data_dir, secret=SECRET)


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def toy_codes_by_finisher():
    """From toys.csv: finisher code -> sorted toy codes. What each user must see, no more, no less."""
    result: dict[str, list[str]] = {}
    with open(config.CSV_DIR / "toys.csv", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            result.setdefault(row["finisher_id"], []).append(row["toy_id"])
    return {code: sorted(toys) for code, toys in result.items()}


@pytest.fixture(autouse=True)
def no_findings_left_behind(request):
    """The seeded data is shared by all tests, so every test starts and ends with no findings."""
    yield
    if "data_dir" not in request.fixturenames:
        return
    data_dir = request.getfixturevalue("data_dir")
    for _username, finisher_id, _name, _code in USERS:
        db = connect(finisher_db_path(data_dir, finisher_id))
        with db:
            db.execute("DELETE FROM child_labor_finding")
        db.close()
