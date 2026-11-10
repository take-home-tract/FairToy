"""The databases: where the files are, their schemas, and the one place connections are opened.

There are two kinds of database (docs/decisions.md, D17):

- the accounts database, one for the app: Finishers and their users;
- a Finisher database, one per Finisher: its toys, parts, suppliers and findings.

No table in a Finisher database has a Finisher column. Everything in the file
belongs to the same Finisher.
"""

import sqlite3
from pathlib import Path

ACCOUNTS_SCHEMA = """
CREATE TABLE finisher (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE app_user (
    id            INTEGER PRIMARY KEY,
    finisher_id   INTEGER NOT NULL REFERENCES finisher (id),
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
"""

FINISHER_SCHEMA = """
CREATE TABLE toy (
    id   INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE part (
    id   INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE supplier (
    id      INTEGER PRIMARY KEY,
    code    TEXT NOT NULL UNIQUE,
    name    TEXT NOT NULL,
    country TEXT NOT NULL
);

CREATE TABLE toy_part (
    toy_id  INTEGER NOT NULL REFERENCES toy (id),
    part_id INTEGER NOT NULL REFERENCES part (id),
    PRIMARY KEY (toy_id, part_id)
);
CREATE INDEX toy_part_by_part ON toy_part (part_id);

CREATE TABLE part_source (
    id              INTEGER PRIMARY KEY,
    part_id         INTEGER NOT NULL REFERENCES part (id),
    supplier_id     INTEGER NOT NULL REFERENCES supplier (id),
    factory_code    TEXT NOT NULL,
    factory_name    TEXT NOT NULL,
    factory_country TEXT NOT NULL,
    UNIQUE (part_id, factory_code)
);
CREATE INDEX part_source_by_supplier ON part_source (supplier_id);

CREATE TABLE child_labor_finding (
    supplier_id INTEGER PRIMARY KEY REFERENCES supplier (id),
    recorded_by TEXT NOT NULL,
    recorded_at TEXT NOT NULL
);
"""


def accounts_db_path(data_dir: Path) -> Path:
    return data_dir / "accounts.db"


def finisher_db_path(data_dir: Path, finisher_id: int) -> Path:
    """The file of one Finisher. The name is built from the numeric id only."""
    if type(finisher_id) is not int or finisher_id < 1:
        raise ValueError(f"Not a Finisher id: {finisher_id!r}")
    return data_dir / f"finisher-{finisher_id}.db"


def connect(path: Path, *, create: bool = False) -> sqlite3.Connection:
    """Open a database. Every connection in the app is opened here.

    SQLite enforces foreign keys only when the pragma is set on each connection.
    Unless `create` is set, a missing file is an error and is never created
    silently: an empty database would look like a Finisher with no data.
    """
    if not create and not path.is_file():
        raise FileNotFoundError(f"Database not found: {path}. Run the seed first.")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
