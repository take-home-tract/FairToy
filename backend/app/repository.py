"""The queries. Every function works on the connection it is given.

That connection is already the signed-in user's Finisher database (app/auth.py),
so nothing here takes or filters by a Finisher: there is only one in the file.
No exposure rules live here either; this module only fetches facts and makes
the writes (findings and resolutions).
"""

import sqlite3
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Facts:
    """Everything the exposure calculator needs for one Finisher."""

    # part id -> every supplier that can make it
    sources_of_part: dict[int, set[int]] = field(default_factory=dict)
    # toy id -> part id -> the suppliers that may have made that part of that toy:
    # every possible source, or only the one the Finisher recorded as used (a resolution)
    parts_of_toy: dict[int, dict[int, set[int]]] = field(default_factory=dict)
    # ids of the suppliers with a finding
    implicated: set[int] = field(default_factory=set)
    # (toy id, part id) -> the supplier recorded as having made it
    resolutions: dict[tuple[int, int], int] = field(default_factory=dict)


def load_facts(db: sqlite3.Connection) -> Facts:
    """A few passes over a few thousand rows per Finisher (D12).

    A resolution narrows the possible sources of one part of one toy to the
    supplier that was used. The exposure rule itself does not change (D21).
    """
    facts = Facts()
    for row in db.execute("SELECT part_id, supplier_id FROM part_source"):
        facts.sources_of_part.setdefault(row["part_id"], set()).add(row["supplier_id"])
    for row in db.execute("SELECT toy_id, part_id, supplier_id FROM part_resolution"):
        facts.resolutions[(row["toy_id"], row["part_id"])] = row["supplier_id"]
    for toy in db.execute("SELECT id FROM toy"):
        facts.parts_of_toy[toy["id"]] = {}
    for row in db.execute("SELECT toy_id, part_id FROM toy_part"):
        used = facts.resolutions.get((row["toy_id"], row["part_id"]))
        # A part with no known source still belongs to its toy, with no supplier.
        facts.parts_of_toy[row["toy_id"]][row["part_id"]] = (
            {used} if used is not None else set(facts.sources_of_part.get(row["part_id"], ()))
        )
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


def supplier_names(db: sqlite3.Connection) -> dict[int, str]:
    return {row["id"]: row["name"] for row in db.execute("SELECT id, name FROM supplier")}


def list_parts_of_supplier(db: sqlite3.Connection, supplier_id: int) -> list[sqlite3.Row]:
    """Each part the supplier can make, once per factory it makes it at."""
    return db.execute(
        """
        SELECT p.id, p.code, p.name, ps.factory_name, ps.factory_country
        FROM part_source ps JOIN part p ON p.id = ps.part_id
        WHERE ps.supplier_id = ?
        ORDER BY p.name COLLATE NOCASE, p.code, ps.factory_name
        """,
        (supplier_id,),
    ).fetchall()


def list_resolutions_of_toy(db: sqlite3.Connection, toy_id: int) -> list[sqlite3.Row]:
    return db.execute(
        """
        SELECT r.part_id, r.recorded_by, r.recorded_at, s.id AS supplier_id, s.name AS supplier_name
        FROM part_resolution r JOIN supplier s ON s.id = r.supplier_id
        WHERE r.toy_id = ?
        """,
        (toy_id,),
    ).fetchall()


def get_resolution(db: sqlite3.Connection, toy_id: int, part_id: int) -> sqlite3.Row | None:
    rows = [r for r in list_resolutions_of_toy(db, toy_id) if r["part_id"] == part_id]
    return rows[0] if rows else None


def get_part_of_toy(db: sqlite3.Connection, toy_id: int, part_id: int) -> sqlite3.Row | None:
    return db.execute(
        """
        SELECT p.id, p.code, p.name
        FROM toy_part tp JOIN part p ON p.id = tp.part_id
        WHERE tp.toy_id = ? AND tp.part_id = ?
        """,
        (toy_id, part_id),
    ).fetchone()


def suppliers_of_part(db: sqlite3.Connection, part_id: int) -> set[int]:
    return {r["supplier_id"] for r in db.execute("SELECT supplier_id FROM part_source WHERE part_id = ?", (part_id,))}


# --- the writes: findings and resolutions ---


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


def record_resolution(
    db: sqlite3.Connection, toy_id: int, part_id: int, supplier_id: int, recorded_by: str, recorded_at: str
) -> None:
    """Record which supplier made a part of a toy.

    Recording the same supplier again changes nothing. Recording another one
    replaces it, with the new who and when.
    """
    with db:
        db.execute(
            """
            INSERT INTO part_resolution (toy_id, part_id, supplier_id, recorded_by, recorded_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (toy_id, part_id) DO UPDATE SET
                supplier_id = excluded.supplier_id,
                recorded_by = excluded.recorded_by,
                recorded_at = excluded.recorded_at
            WHERE part_resolution.supplier_id != excluded.supplier_id
            """,
            (toy_id, part_id, supplier_id, recorded_by, recorded_at),
        )


def withdraw_resolution(db: sqlite3.Connection, toy_id: int, part_id: int) -> None:
    """Idempotent: withdrawing a resolution that is not there changes nothing."""
    with db:
        db.execute("DELETE FROM part_resolution WHERE toy_id = ? AND part_id = ?", (toy_id, part_id))
