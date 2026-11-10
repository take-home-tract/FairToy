"""The use cases: list toys, trace a toy, list suppliers, preview and record a finding.

Each takes the connection to the signed-in user's Finisher database. They fetch
facts through the repository and apply the rule through the exposure
calculator. They know nothing about HTTP, apart from raising ApiError for
"not found", and nothing about other Finishers.
"""

import sqlite3
from datetime import datetime, timezone

from app import repository
from app.errors import ApiError
from app.exposure import SEVERITY, Exposure, toy_exposure
from app.schemas import (
    FindingOut,
    FindingResponse,
    ReachedToy,
    SupplierDetailResponse,
    SupplierListItem,
    SupplierOut,
    SupplierPart,
    SupplierRef,
    SuppliersResponse,
    ToyListItem,
    ToysResponse,
    ToySummary,
    ToyTraceResponse,
    TraceFactory,
    TracePart,
    TraceSource,
    TraceSupplier,
    TraceToy,
)


def _toy_not_found() -> ApiError:
    return ApiError(404, "toy_not_found", "No such toy for this Finisher.")


def _supplier_not_found() -> ApiError:
    return ApiError(404, "supplier_not_found", "No such supplier for this Finisher.")


def _finding_of(row: sqlite3.Row) -> FindingOut | None:
    if row["recorded_at"] is None:
        return None
    return FindingOut(recorded_at=row["recorded_at"], recorded_by=row["recorded_by"])


def _by_name(row) -> tuple:
    return (row["name"].lower(), row["code"])


def _refs(supplier_ids: set[int], names: dict[int, str]) -> list[SupplierRef]:
    """Suppliers as id and name, sorted by name."""
    refs = [SupplierRef(id=supplier_id, name=names[supplier_id]) for supplier_id in supplier_ids]
    return sorted(refs, key=lambda ref: (ref.name.lower(), ref.id))


# --- toys ---


def list_toys(db: sqlite3.Connection) -> ToysResponse:
    facts = repository.load_facts(db)
    names = repository.supplier_names(db)
    items = []
    for toy in repository.list_toys(db):
        parts = facts.parts_of_toy[toy["id"]]
        result = toy_exposure(parts, facts.implicated)
        flagged = {s for suppliers in parts.values() for s in suppliers if s in facts.implicated}
        items.append(
            ToyListItem(
                id=toy["id"],
                code=toy["code"],
                name=toy["name"],
                exposure=result.exposure,
                parts_touched=result.parts_touched,
                part_count=len(result.parts),
                flagged_suppliers=_refs(flagged, names),
            )
        )
    items.sort(key=lambda t: (SEVERITY.index(t.exposure), t.name.lower(), t.code))
    count = lambda exposure: sum(1 for t in items if t.exposure is exposure)
    return ToysResponse(
        summary=ToySummary(
            total=len(items),
            affected=count(Exposure.AFFECTED),
            possibly_affected=count(Exposure.POSSIBLY_AFFECTED),
            no_finding=count(Exposure.NO_FINDING),
        ),
        toys=items,
    )


def toy_trace(db: sqlite3.Connection, toy_id: int) -> ToyTraceResponse:
    toy = repository.get_toy(db, toy_id)
    if toy is None:
        raise _toy_not_found()
    facts = repository.load_facts(db)
    result = toy_exposure(facts.parts_of_toy[toy_id], facts.implicated)

    sources_of_part: dict[int, list[TraceSource]] = {}
    for row in repository.list_sources_of_toy(db, toy_id):
        sources_of_part.setdefault(row["part_id"], []).append(
            TraceSource(
                supplier=TraceSupplier(
                    id=row["supplier_id"], name=row["supplier_name"], country=row["supplier_country"]
                ),
                factory=TraceFactory(name=row["factory_name"], country=row["factory_country"]),
                has_finding=row["supplier_id"] in facts.implicated,
            )
        )

    parts = []
    for part in repository.list_parts_of_toy(db, toy_id):
        sources = sources_of_part.get(part["id"], [])
        # Implicated sources first, then by name.
        sources.sort(key=lambda s: (not s.has_finding, s.supplier.name.lower(), s.factory.name.lower()))
        parts.append(
            TracePart(
                id=part["id"],
                code=part["code"],
                name=part["name"],
                exposure=result.parts[part["id"]],
                sources=sources,
            )
        )
    # Exposed parts first.
    parts.sort(key=lambda p: (SEVERITY.index(p.exposure), p.name.lower(), p.code))
    return ToyTraceResponse(
        toy=TraceToy(id=toy["id"], code=toy["code"], name=toy["name"], exposure=result.exposure),
        parts=parts,
    )


# --- suppliers ---


def _reaches(parts: dict[int, set[int]], supplier_id: int) -> bool:
    """Does a toy use a part this supplier can make?"""
    return any(supplier_id in suppliers for suppliers in parts.values())


def list_suppliers(db: sqlite3.Connection) -> SuppliersResponse:
    facts = repository.load_facts(db)
    suppliers_of_part = facts.suppliers_of_part()
    rows = sorted(repository.list_suppliers(db), key=_by_name)
    return SuppliersResponse(
        suppliers=[
            SupplierListItem(
                id=row["id"],
                code=row["code"],
                name=row["name"],
                country=row["country"],
                part_count=sum(1 for suppliers in suppliers_of_part.values() if row["id"] in suppliers),
                toys_reached=sum(1 for parts in facts.parts_of_toy.values() if _reaches(parts, row["id"])),
                finding=_finding_of(row),
            )
            for row in rows
        ]
    )


def supplier_detail(db: sqlite3.Connection, supplier_id: int) -> SupplierDetailResponse:
    """The supplier, the parts it can make, and each toy it reaches through them.

    Each toy has its exposure now and what it would be with a finding: the
    preview is the same calculation with this supplier added to the implicated set.
    """
    supplier = repository.get_supplier(db, supplier_id)
    if supplier is None:
        raise _supplier_not_found()
    facts = repository.load_facts(db)
    names = repository.supplier_names(db)
    suppliers_of_part = facts.suppliers_of_part()
    if_flagged = facts.implicated | {supplier_id}

    # The parts this supplier can make, in name order (the query sorts them).
    parts: dict[int, SupplierPart] = {}
    for row in repository.list_parts_of_supplier(db, supplier_id):
        part = parts.get(row["id"])
        if part is None:
            part = parts[row["id"]] = SupplierPart(
                id=row["id"],
                code=row["code"],
                name=row["name"],
                factories=[],
                other_suppliers=_refs(suppliers_of_part[row["id"]] - {supplier_id}, names),
                toy_count=sum(1 for toy_parts in facts.parts_of_toy.values() if row["id"] in toy_parts),
            )
        part.factories.append(TraceFactory(name=row["factory_name"], country=row["factory_country"]))

    toys = []
    for toy in repository.list_toys(db):
        toy_parts = facts.parts_of_toy[toy["id"]]
        connecting = [part_id for part_id in parts if part_id in toy_parts]
        if not connecting:
            continue
        toys.append(
            ReachedToy(
                id=toy["id"],
                code=toy["code"],
                name=toy["name"],
                exposure_now=toy_exposure(toy_parts, facts.implicated).exposure,
                exposure_if_flagged=toy_exposure(toy_parts, if_flagged).exposure,
                part_ids=connecting,
            )
        )
    toys.sort(key=lambda t: (SEVERITY.index(t.exposure_if_flagged), t.name.lower(), t.code))
    return SupplierDetailResponse(
        supplier=SupplierOut(
            id=supplier["id"],
            code=supplier["code"],
            name=supplier["name"],
            country=supplier["country"],
            finding=_finding_of(supplier),
        ),
        parts=list(parts.values()),
        toys=toys,
    )


# --- findings ---


def _finding_state(db: sqlite3.Connection, supplier_id: int) -> FindingResponse:
    supplier = repository.get_supplier(db, supplier_id)
    if supplier is None:
        raise _supplier_not_found()
    return FindingResponse(finding=_finding_of(supplier))


def record_finding(db: sqlite3.Connection, supplier_id: int, username: str) -> FindingResponse:
    _finding_state(db, supplier_id)  # 404 if the supplier is not this Finisher's
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    repository.record_finding(db, supplier_id, recorded_by=username, recorded_at=now)
    return _finding_state(db, supplier_id)


def withdraw_finding(db: sqlite3.Connection, supplier_id: int) -> FindingResponse:
    _finding_state(db, supplier_id)
    repository.withdraw_finding(db, supplier_id)
    return _finding_state(db, supplier_id)
