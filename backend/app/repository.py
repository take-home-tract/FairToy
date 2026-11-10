"""The queries. Every function works on the connection it is given.

That connection is already the signed-in user's Finisher database (app/auth.py),
so nothing here takes or filters by a Finisher: there is only one in the file.
No exposure rules live here either; this module only fetches facts and makes
the two writes.
"""

import sqlite3
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Facts:
    """Everything the exposure calculator needs for one Finisher."""

    # toy id -> part id -> ids of the suppliers that can make the part
    parts_of_toy: dict[int, dict[int, set[int]]] = field(default_factory=dict)
    # ids of the suppliers with a finding
    implicated: set[int] = field(default_factory=set)


def load_facts(db: sqlite3.Connection) -> Facts:
    """One pass over the links: a few thousand rows per Finisher (D12)."""
    facts = Facts()
    for toy in db.execute("SELECT id FROM toy"):
        facts.parts_of_toy[toy["id"]] = {}
    # LEFT JOIN: a part with no known source still belongs to its toy.
    rows = db.execute(
        """
        SELECT tp.toy_id, tp.part_id, ps.supplier_id
        FROM toy_part tp LEFT JOIN part_source ps ON ps.part_id = tp.part_id
        """
    )
    for row in rows:
        suppliers = facts.parts_of_toy[row["toy_id"]].setdefault(row["part_id"], set())
        if row["supplier_id"] is not None:
            suppliers.add(row["supplier_id"])
    facts.implicated.update(r["supplier_id"] for r in db.execute("SELECT supplier_id FROM child_labor_finding"))
    return facts


def list_toys(db: sqlite3.Connection) -> list[sqlite3.Row]:
    return db.execute("SELECT id, code, name FROM toy").fetchall()


def get_toy(db: sqlite3.Connection, toy_id: int) -> sqlite3.Row | None:
    return db.execute("SELECT id, code, name FROM toy WHERE id = ?", (toy_id,)).fetchone()


def list_parts_of_toy(db: sqlite3.Connection, toy_id: int) -> list[sqlite3.Row]:
    return db.execute(
        """
        SELECT p.id, p.code, p.name
        FROM toy_part tp JOIN part p ON p.id = tp.part_id
        WHERE tp.toy_id = ?
        """,
        (toy_id,),
    ).fetchall()


def list_sources_of_toy(db: sqlite3.Connection, toy_id: int) -> list[sqlite3.Row]:
    """Every possible source of every part of one toy."""
    return db.execute(
        """
        SELECT ps.part_id, ps.factory_name, ps.factory_country,
               s.id AS supplier_id, s.name AS supplier_name, s.country AS supplier_country
        FROM toy_part tp
        JOIN part_source ps ON ps.part_id = tp.part_id
        JOIN supplier s ON s.id = ps.supplier_id
        WHERE tp.toy_id = ?
        """,
        (toy_id,),
    ).fetchall()


_SUPPLIER_WITH_FINDING = """
    SELECT s.id, s.code, s.name, s.country, f.recorded_by, f.recorded_at
    FROM supplier s LEFT JOIN child_labor_finding f ON f.supplier_id = s.id
"""


def list_suppliers(db: sqlite3.Connection) -> list[sqlite3.Row]:
    """Each supplier with its finding, if any (recorded_at is NULL when there is none)."""
    return db.execute(_SUPPLIER_WITH_FINDING).fetchall()


def get_supplier(db: sqlite3.Connection, supplier_id: int) -> sqlite3.Row | None:
    return db.execute(_SUPPLIER_WITH_FINDING + "WHERE s.id = ?", (supplier_id,)).fetchone()


# --- the two writes ---


def record_finding(db: sqlite3.Connection, supplier_id: int, recorded_by: str, recorded_at: str) -> None:
    """Idempotent: if the supplier already has a finding, it is left as it is."""
    with db:
        db.execute(
            "INSERT OR IGNORE INTO child_labor_finding (supplier_id, recorded_by, recorded_at) VALUES (?, ?, ?)",
            (supplier_id, recorded_by, recorded_at),
        )


def withdraw_finding(db: sqlite3.Connection, supplier_id: int) -> None:
    """Idempotent: withdrawing a finding that is not there changes nothing."""
    with db:
        db.execute("DELETE FROM child_labor_finding WHERE supplier_id = ?", (supplier_id,))
