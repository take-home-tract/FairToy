"""One-off seed: the six CSV files become the accounts database and one database per Finisher.

Run from the backend folder:  uv run python -m app.seed

See "Seed" in docs/design.md. In short:
- everything is read and checked before any file is written;
- it refuses to run if a database already exists, so findings are never wiped;
- each Finisher database gets only that Finisher's toys, the parts those toys
  use, and the suppliers that can make those parts.
"""

import csv
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from app import config
from app.db import ACCOUNTS_SCHEMA, FINISHER_SCHEMA, accounts_db_path, connect, finisher_db_path
from app.security import hash_password


class SeedError(Exception):
    """The seed cannot run. The message says why, in plain words."""


@dataclass(frozen=True)
class FinisherSummary:
    finisher_id: int
    name: str
    username: str
    toys: int
    parts: int
    suppliers: int
    part_sources: int
    toy_parts: int


def username_for(finisher_name: str) -> str:
    """'Kestrel Play' -> 'kestrel-play', 'Arbor & Finch' -> 'arbor-finch'."""
    return re.sub(r"[^a-z0-9]+", "-", finisher_name.lower()).strip("-")


def _read(csv_dir: Path, filename: str) -> list[dict[str, str]]:
    path = csv_dir / filename
    if not path.is_file():
        raise SeedError(f"Missing file: {path}")
    # utf-8-sig also accepts a file saved with a byte-order mark (Excel does that).
    with open(path, newline="", encoding="utf-8-sig") as f:
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def _check_references(finishers, suppliers, factories, part_rows, toy_rows, bom_rows) -> None:
    """Stop on the first broken reference, naming the row."""
    for row in factories.values():
        if row["supplier_id"] not in suppliers:
            raise SeedError(f"factories.csv: {row['factory_id']} names unknown supplier {row['supplier_id']}")
    for row in part_rows:
        part, supplier, factory = row["part_id"], row["supplier_id"], row["factory_id"]
        if supplier not in suppliers:
            raise SeedError(f"parts.csv: {part} names unknown supplier {supplier}")
        if factory not in factories:
            raise SeedError(f"parts.csv: {part} names unknown factory {factory}")
        if factories[factory]["supplier_id"] != supplier:
            raise SeedError(
                f"parts.csv: {part} says {supplier} makes it at {factory}, "
                f"but that factory belongs to {factories[factory]['supplier_id']}"
            )
    part_codes = {row["part_id"] for row in part_rows}
    toy_codes = {row["toy_id"] for row in toy_rows}
    for row in toy_rows:
        if row["finisher_id"] not in finishers:
            raise SeedError(f"toys.csv: {row['toy_id']} names unknown finisher {row['finisher_id']}")
    for row in bom_rows:
        if row["toy_id"] not in toy_codes:
            raise SeedError(f"bill_of_materials.csv: unknown toy {row['toy_id']}")
        if row["part_id"] not in part_codes:
            raise SeedError(f"bill_of_materials.csv: {row['toy_id']} uses unknown part {row['part_id']}")


def seed(csv_dir: Path, data_dir: Path, password: str) -> list[FinisherSummary]:
    # 1. Read everything. Later rows with the same key do not replace earlier ones silently:
    #    codes are unique in these three files, and the dicts are only lookups.
    finishers = {r["finisher_id"]: r for r in _read(csv_dir, "finishers.csv")}
    suppliers = {r["supplier_id"]: r for r in _read(csv_dir, "suppliers.csv")}
    factories = {r["factory_id"]: r for r in _read(csv_dir, "factories.csv")}
    part_rows = _read(csv_dir, "parts.csv")
    toy_rows = _read(csv_dir, "toys.csv")
    bom_rows = _read(csv_dir, "bill_of_materials.csv")

    # 2. Check everything before writing anything.
    _check_references(finishers, suppliers, factories, part_rows, toy_rows, bom_rows)

    usernames = {code: username_for(row["finisher_name"]) for code, row in finishers.items()}
    if len(set(usernames.values())) != len(usernames):
        raise SeedError("Two finishers would get the same username.")

    # Finisher ids are internal: 1, 2, 3... in file order. They are unrelated to the FIN- codes.
    finisher_ids = {code: i for i, code in enumerate(finishers, start=1)}

    data_dir.mkdir(parents=True, exist_ok=True)
    targets = [accounts_db_path(data_dir)] + [finisher_db_path(data_dir, i) for i in finisher_ids.values()]
    existing = [p for p in targets if p.exists()]
    if existing:
        raise SeedError(
            f"Already seeded: {existing[0]} exists. The seed never overwrites a database, "
            f"because that would wipe recorded findings. To start over, delete the folder {data_dir}"
        )

    # 3. Accounts database: Finishers and one user each.
    accounts = connect(accounts_db_path(data_dir), create=True)
    with accounts:
        accounts.executescript(ACCOUNTS_SCHEMA)
        for code, row in finishers.items():
            accounts.execute(
                "INSERT INTO finisher (id, name) VALUES (?, ?)", (finisher_ids[code], row["finisher_name"])
            )
            accounts.execute(
                "INSERT INTO app_user (finisher_id, username, password_hash) VALUES (?, ?, ?)",
                (finisher_ids[code], usernames[code], hash_password(password)),
            )
    accounts.close()

    # 4. One database per Finisher, filled with that Finisher's data only.
    part_names = {row["part_id"]: row["part_name"] for row in part_rows}
    parts_of_toy: dict[str, set[str]] = {}
    for row in bom_rows:
        parts_of_toy.setdefault(row["toy_id"], set()).add(row["part_id"])

    summaries = []
    for code, row in finishers.items():
        my_toys = sorted((t for t in toy_rows if t["finisher_id"] == code), key=lambda t: t["toy_id"])
        my_part_codes = sorted({p for t in my_toys for p in parts_of_toy.get(t["toy_id"], ())})
        my_sources = [r for r in part_rows if r["part_id"] in set(my_part_codes)]
        my_supplier_codes = sorted({r["supplier_id"] for r in my_sources})

        db = connect(finisher_db_path(data_dir, finisher_ids[code]), create=True)
        with db:
            db.executescript(FINISHER_SCHEMA)
            toy_id, part_id, supplier_id = {}, {}, {}
            for t in my_toys:
                cur = db.execute("INSERT INTO toy (code, name) VALUES (?, ?)", (t["toy_id"], t["toy_name"]))
                toy_id[t["toy_id"]] = cur.lastrowid
            for p in my_part_codes:
                cur = db.execute("INSERT INTO part (code, name) VALUES (?, ?)", (p, part_names[p]))
                part_id[p] = cur.lastrowid
            for s in my_supplier_codes:
                cur = db.execute(
                    "INSERT INTO supplier (code, name, country) VALUES (?, ?, ?)",
                    (s, suppliers[s]["supplier_name"], suppliers[s]["hq_country"]),
                )
                supplier_id[s] = cur.lastrowid
            toy_part_links = [
                (toy_id[t["toy_id"]], part_id[p])
                for t in my_toys
                for p in sorted(parts_of_toy.get(t["toy_id"], ()))
            ]
            db.executemany("INSERT INTO toy_part (toy_id, part_id) VALUES (?, ?)", toy_part_links)
            db.executemany(
                "INSERT INTO part_source (part_id, supplier_id, factory_code, factory_name, factory_country) "
                "VALUES (?, ?, ?, ?, ?)",
                [
                    (
                        part_id[r["part_id"]],
                        supplier_id[r["supplier_id"]],
                        r["factory_id"],
                        factories[r["factory_id"]]["factory_name"],
                        factories[r["factory_id"]]["country"],
                    )
                    for r in my_sources
                ],
            )
        db.close()

        summaries.append(
            FinisherSummary(
                finisher_id=finisher_ids[code],
                name=row["finisher_name"],
                username=usernames[code],
                toys=len(my_toys),
                parts=len(my_part_codes),
                suppliers=len(my_supplier_codes),
                part_sources=len(my_sources),
                toy_parts=len(toy_part_links),
            )
        )
    return summaries


def main() -> int:
    try:
        summaries = seed(config.CSV_DIR, config.DATA_DIR, config.DEMO_PASSWORD)
    except SeedError as e:
        print(f"Seed stopped: {e}", file=sys.stderr)
        return 1

    print(f"Seeded {len(summaries)} Finishers into {config.DATA_DIR}\n")
    print(f"{'Finisher':<20}{'Username':<20}{'Toys':>6}{'Parts':>7}{'Suppliers':>11}{'Sources':>9}{'Toy-parts':>11}")
    for s in summaries:
        print(f"{s.name:<20}{s.username:<20}{s.toys:>6}{s.parts:>7}{s.suppliers:>11}{s.part_sources:>9}{s.toy_parts:>11}")
    total = lambda field: sum(getattr(s, field) for s in summaries)
    print(
        f"{'Total':<40}{total('toys'):>6}{total('parts'):>7}{total('suppliers'):>11}"
        f"{total('part_sources'):>9}{total('toy_parts'):>11}"
    )
    print(f"\nEvery user signs in with the password: {config.DEMO_PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
