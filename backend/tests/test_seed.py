"""The seed, checked against the sample data and against small broken inputs."""

import csv
import shutil
import sqlite3

import pytest

from app import config
from app.db import accounts_db_path, connect, finisher_db_path
from app.security import verify_password
from app.seed import SeedError, seed, username_for

PASSWORD = "test-password"


@pytest.fixture(scope="module")
def seeded(tmp_path_factory):
    """The real sample data, seeded once into a temporary folder."""
    data_dir = tmp_path_factory.mktemp("data")
    summaries = seed(config.CSV_DIR, data_dir, PASSWORD)
    return data_dir, summaries


def count(db, table):
    return db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def test_totals_match_the_design_doc(seeded):
    data_dir, summaries = seeded
    totals = {"toy": 0, "part": 0, "supplier": 0, "part_source": 0, "toy_part": 0}
    for s in summaries:
        db = connect(finisher_db_path(data_dir, s.finisher_id))
        for table in totals:
            totals[table] += count(db, table)
        db.close()
    assert totals == {"toy": 305, "part": 3079, "supplier": 392, "part_source": 3250, "toy_part": 10648}


def test_accounts_hold_eight_finishers_with_one_user_each(seeded):
    data_dir, _ = seeded
    accounts = connect(accounts_db_path(data_dir))
    rows = accounts.execute(
        "SELECT f.id, f.name, u.username, u.password_hash FROM finisher f JOIN app_user u ON u.finisher_id = f.id ORDER BY f.id"
    ).fetchall()
    assert len(rows) == 8
    assert (rows[1]["id"], rows[1]["name"], rows[1]["username"]) == (2, "Kestrel Play", "kestrel-play")
    assert rows[3]["username"] == "arbor-finch"
    for row in rows:
        assert PASSWORD not in row["password_hash"]
        assert verify_password(PASSWORD, row["password_hash"])
        assert not verify_password("wrong", row["password_hash"])


def test_each_finisher_database_holds_exactly_its_own_toys(seeded):
    data_dir, summaries = seeded
    with open(config.CSV_DIR / "finishers.csv", newline="", encoding="utf-8") as f:
        finisher_codes = [r["finisher_id"] for r in csv.DictReader(f)]
    with open(config.CSV_DIR / "toys.csv", newline="", encoding="utf-8") as f:
        toy_rows = list(csv.DictReader(f))
    for s, finisher_code in zip(summaries, finisher_codes):
        expected = sorted(r["toy_id"] for r in toy_rows if r["finisher_id"] == finisher_code)
        db = connect(finisher_db_path(data_dir, s.finisher_id))
        assert [r["code"] for r in db.execute("SELECT code FROM toy ORDER BY code")] == expected
        db.close()


def test_a_finisher_database_holds_only_what_its_toys_reach(seeded):
    data_dir, summaries = seeded
    for s in summaries:
        db = connect(finisher_db_path(data_dir, s.finisher_id))
        unused_parts = db.execute(
            "SELECT COUNT(*) FROM part WHERE id NOT IN (SELECT part_id FROM toy_part)"
        ).fetchone()[0]
        unused_suppliers = db.execute(
            "SELECT COUNT(*) FROM supplier WHERE id NOT IN (SELECT supplier_id FROM part_source)"
        ).fetchone()[0]
        parts_without_source = db.execute(
            "SELECT COUNT(*) FROM part WHERE id NOT IN (SELECT part_id FROM part_source)"
        ).fetchone()[0]
        assert (unused_parts, unused_suppliers, parts_without_source) == (0, 0, 0)
        assert count(db, "child_labor_finding") == 0
        db.close()


def test_kestrel_play_has_40_toys_and_49_suppliers(seeded):
    data_dir, _ = seeded
    db = connect(finisher_db_path(data_dir, 2))
    assert count(db, "toy") == 40
    assert count(db, "supplier") == 49
    assert db.execute("SELECT COUNT(*) FROM supplier WHERE code = 'SUP-038'").fetchone()[0] == 0
    db.close()


def test_no_finisher_database_has_a_finisher_column(seeded):
    data_dir, _ = seeded
    db = connect(finisher_db_path(data_dir, 1))
    tables = [r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")]
    assert sorted(tables) == [
        "child_labor_finding", "part", "part_resolution", "part_source", "supplier", "toy", "toy_part",
    ]
    for table in tables:
        columns = [r["name"] for r in db.execute(f"PRAGMA table_info({table})")]
        assert not [c for c in columns if "finisher" in c]
    db.close()


def test_foreign_keys_are_enforced(seeded):
    data_dir, _ = seeded
    db = connect(finisher_db_path(data_dir, 1))
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO child_labor_finding VALUES (999999, 'someone', '2026-11-10T00:00:00Z')")
    db.close()


def test_seed_refuses_to_run_twice_and_changes_nothing(seeded):
    data_dir, _ = seeded
    db = connect(finisher_db_path(data_dir, 3))
    with db:
        db.execute("INSERT INTO child_labor_finding VALUES (1, 'someone', '2026-11-10T00:00:00Z')")
    with pytest.raises(SeedError, match="Already seeded"):
        seed(config.CSV_DIR, data_dir, PASSWORD)
    assert count(db, "child_labor_finding") == 1
    with db:
        db.execute("DELETE FROM child_labor_finding")
    db.close()


def test_connect_does_not_create_a_missing_database(tmp_path):
    with pytest.raises(FileNotFoundError):
        connect(finisher_db_path(tmp_path, 1))
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("bad_id", [0, -1, "1", "../accounts", 1.0, True, None])
def test_finisher_db_path_accepts_only_a_positive_integer(tmp_path, bad_id):
    with pytest.raises(ValueError):
        finisher_db_path(tmp_path, bad_id)


def test_username_rule():
    assert username_for("Kestrel Play") == "kestrel-play"
    assert username_for("Arbor & Finch") == "arbor-finch"
    assert username_for("Papercrane Ltd") == "papercrane-ltd"


# --- broken inputs: copy the sample, break one row, expect a clear stop and no files ---


def _broken_copy(tmp_path, filename, replace_from, replace_to):
    csv_dir = tmp_path / "csv"
    shutil.copytree(config.CSV_DIR, csv_dir)
    path = csv_dir / filename
    text = path.read_text(encoding="utf-8")
    assert replace_from in text
    path.write_text(text.replace(replace_from, replace_to, 1), encoding="utf-8")
    return csv_dir


@pytest.mark.parametrize(
    "filename, replace_from, replace_to, message",
    [
        ("bill_of_materials.csv", "TOY-0275,PRT-0176,", "TOY-0275,PRT-9999,", "unknown part PRT-9999"),
        ("bill_of_materials.csv", "TOY-0275,PRT-0176,", "TOY-9999,PRT-0176,", "unknown toy TOY-9999"),
        ("toys.csv", ",FIN-003,", ",FIN-999,", "unknown finisher FIN-999"),
        ("parts.csv", ",SUP-027,FAC-0124,", ",SUP-999,FAC-0124,", "unknown supplier SUP-999"),
        ("parts.csv", ",SUP-027,FAC-0124,", ",SUP-027,FAC-9999,", "unknown factory FAC-9999"),
        # FAC-0001 exists but belongs to SUP-001, not SUP-027.
        ("parts.csv", ",SUP-027,FAC-0124,", ",SUP-027,FAC-0001,", "belongs to SUP-001"),
    ],
)
def test_seed_stops_on_a_broken_reference(tmp_path, filename, replace_from, replace_to, message):
    csv_dir = _broken_copy(tmp_path, filename, replace_from, replace_to)
    data_dir = tmp_path / "data"
    with pytest.raises(SeedError, match=message):
        seed(csv_dir, data_dir, PASSWORD)
    assert not data_dir.exists() or list(data_dir.iterdir()) == []
