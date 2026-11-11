"""Resolutions: recording which supplier actually made a part of a toy.

Lantern Crane (TOY-0029) of Kestrel Play uses "soft filling" (PRT-0117), which
Lianfa Group or Everstar Fabrication can make. With Lianfa Group flagged, the toy
is possibly affected (docs/ux.md). Resolving the part settles it.
"""

import sqlite3

import pytest

from app.db import connect, finisher_db_path
from tests.helpers import sign_in, supplier_named, toy_coded


@pytest.fixture
def kestrel(client):
    return sign_in(client, "kestrel-play")


def flag(client, headers, name):
    supplier = supplier_named(client, headers, name)
    assert client.put(f"/api/suppliers/{supplier['id']}/finding", headers=headers).status_code == 200
    return supplier


def unflag(client, headers, name):
    supplier = supplier_named(client, headers, name)
    assert client.delete(f"/api/suppliers/{supplier['id']}/finding", headers=headers).status_code == 200


def trace(client, headers, code):
    return client.get(f"/api/toys/{toy_coded(client, headers, code)['id']}", headers=headers).json()


def soft_filling(client, headers):
    """Lantern Crane's soft filling: (url of its resolution, Lianfa Group id, Everstar Fabrication id)."""
    toy = toy_coded(client, headers, "TOY-0029")
    part = next(p for p in client.get(f"/api/toys/{toy['id']}", headers=headers).json()["parts"] if p["code"] == "PRT-0117")
    ids = {s["supplier"]["name"]: s["supplier"]["id"] for s in part["sources"]}
    return f"/api/toys/{toy['id']}/parts/{part['id']}/resolution", ids["Lianfa Group"], ids["Everstar Fabrication"]


def summary(client, headers):
    return client.get("/api/toys", headers=headers).json()["summary"]


def test_resolving_to_the_unflagged_supplier_clears_the_toy(client, kestrel):
    flag(client, kestrel, "Lianfa Group")
    url, _lianfa, everstar = soft_filling(client, kestrel)
    assert summary(client, kestrel) == {"total": 40, "affected": 13, "possiblyAffected": 9, "noFinding": 18}

    response = client.put(url, json={"supplierId": everstar}, headers=kestrel)
    assert response.status_code == 200
    resolution = response.json()["resolution"]
    assert resolution["supplier"] == {"id": everstar, "name": "Everstar Fabrication"}
    assert resolution["recordedBy"] == "kestrel-play"

    body = trace(client, kestrel, "TOY-0029")
    assert body["toy"]["exposure"] == "no_finding"
    part = next(p for p in body["parts"] if p["code"] == "PRT-0117")
    assert part["exposure"] == "no_finding"
    assert part["resolution"] == resolution
    # Every possible source is still listed: the resolution says which one was used.
    assert [s["supplier"]["name"] for s in part["sources"]] == ["Lianfa Group", "Everstar Fabrication"]

    assert summary(client, kestrel) == {"total": 40, "affected": 13, "possiblyAffected": 8, "noFinding": 19}
    assert toy_coded(client, kestrel, "TOY-0029")["partsResolved"] == 1


def test_resolving_to_the_flagged_supplier_makes_the_toy_affected(client, kestrel):
    flag(client, kestrel, "Lianfa Group")
    url, lianfa, _everstar = soft_filling(client, kestrel)
    client.put(url, json={"supplierId": lianfa}, headers=kestrel)
    assert trace(client, kestrel, "TOY-0029")["toy"]["exposure"] == "affected"
    assert summary(client, kestrel) == {"total": 40, "affected": 14, "possiblyAffected": 8, "noFinding": 18}


def test_withdrawing_restores_possibly_affected_and_is_idempotent(client, kestrel):
    flag(client, kestrel, "Lianfa Group")
    url, _lianfa, everstar = soft_filling(client, kestrel)
    before = client.get("/api/toys", headers=kestrel).json()
    client.put(url, json={"supplierId": everstar}, headers=kestrel)
    assert client.delete(url, headers=kestrel).json() == {"resolution": None}
    assert client.delete(url, headers=kestrel).json() == {"resolution": None}
    assert client.get("/api/toys", headers=kestrel).json() == before


def test_same_supplier_keeps_the_original_record_another_supplier_replaces_it(client, kestrel, data_dir):
    url, lianfa, everstar = soft_filling(client, kestrel)
    client.put(url, json={"supplierId": everstar}, headers=kestrel)
    db = connect(finisher_db_path(data_dir, 2))
    with db:
        db.execute("UPDATE part_resolution SET recorded_at = '2026-01-01T00:00:00Z'")
    db.close()

    same = client.put(url, json={"supplierId": everstar}, headers=kestrel).json()["resolution"]
    assert same["recordedAt"] == "2026-01-01T00:00:00Z"

    other = client.put(url, json={"supplierId": lianfa}, headers=kestrel).json()["resolution"]
    assert other["supplier"]["name"] == "Lianfa Group"
    assert other["recordedAt"] != "2026-01-01T00:00:00Z"


def test_a_resolution_is_a_fact_that_outlives_findings(client, kestrel):
    """The part came from Everstar Fabrication whatever is flagged: the toy follows Everstar, not Lianfa."""
    flag(client, kestrel, "Lianfa Group")
    url, _lianfa, everstar = soft_filling(client, kestrel)
    client.put(url, json={"supplierId": everstar}, headers=kestrel)

    unflag(client, kestrel, "Lianfa Group")
    flag(client, kestrel, "Lianfa Group")
    assert trace(client, kestrel, "TOY-0029")["toy"]["exposure"] == "no_finding"

    flag(client, kestrel, "Everstar Fabrication")
    assert trace(client, kestrel, "TOY-0029")["toy"]["exposure"] == "affected"


def test_a_resolution_applies_to_one_toy_only(client, kestrel):
    """Soft filling is used by other toys too. They stay possibly affected until resolved themselves."""
    flag(client, kestrel, "Lianfa Group")
    url, _lianfa, everstar = soft_filling(client, kestrel)
    lianfa = supplier_named(client, kestrel, "Lianfa Group")
    detail = client.get(f"/api/suppliers/{lianfa['id']}", headers=kestrel).json()
    part_id = next(p["id"] for p in detail["parts"] if p["code"] == "PRT-0117")
    others = [t["code"] for t in detail["toys"] if part_id in t["partIds"] and t["code"] != "TOY-0029"]
    assert len(others) == 6

    client.put(url, json={"supplierId": everstar}, headers=kestrel)
    for code in others:
        part = next(p for p in trace(client, kestrel, code)["parts"] if p["code"] == "PRT-0117")
        assert part["resolution"] is None
        assert part["exposure"] == "possibly_affected"


def test_suppliers_and_the_flag_preview_follow_resolutions(client, kestrel):
    """Lantern Crane reaches Lianfa Group only through soft filling. Once that is known to come
    from Everstar Fabrication, Lianfa Group no longer reaches it."""
    url, _lianfa, everstar = soft_filling(client, kestrel)
    lianfa = supplier_named(client, kestrel, "Lianfa Group")
    assert lianfa["toysReached"] == 22

    client.put(url, json={"supplierId": everstar}, headers=kestrel)

    assert supplier_named(client, kestrel, "Lianfa Group")["toysReached"] == 21
    detail = client.get(f"/api/suppliers/{lianfa['id']}", headers=kestrel).json()
    assert "TOY-0029" not in {t["code"] for t in detail["toys"]}
    soft = next(p for p in detail["parts"] if p["code"] == "PRT-0117")
    assert soft["toyCount"] == 6
    assert [s["name"] for s in soft["otherSuppliers"]] == ["Everstar Fabrication"]  # still a possible source in general

    # For Everstar Fabrication, Lantern Crane would now be affected, not possibly.
    everstar_detail = client.get(f"/api/suppliers/{everstar}", headers=kestrel).json()
    lantern = next(t for t in everstar_detail["toys"] if t["code"] == "TOY-0029")
    assert lantern["exposureIfFlagged"] == "affected"


def test_resolution_errors(client, kestrel):
    url, lianfa, _everstar = soft_filling(client, kestrel)
    toy_id, part_id = int(url.split("/")[3]), int(url.split("/")[5])
    marble = toy_coded(client, kestrel, "TOY-0290")
    wheel = next(p for p in client.get(f"/api/toys/{marble['id']}", headers=kestrel).json()["parts"] if p["code"] == "PRT-0223")
    sanhe = supplier_named(client, kestrel, "Sanhe Precision")

    def error(method, path, body=None):
        response = client.request(method, path, json=body, headers=kestrel)
        return response.status_code, response.json()["error"]["code"]

    assert error("PUT", f"/api/toys/99999/parts/{part_id}/resolution", {"supplierId": lianfa}) == (404, "toy_not_found")
    assert error("PUT", f"/api/toys/{toy_id}/parts/{wheel['id']}/resolution", {"supplierId": lianfa}) == (404, "part_not_found")
    assert error("DELETE", f"/api/toys/{toy_id}/parts/99999/resolution") == (404, "part_not_found")
    assert error("PUT", url, {"supplierId": sanhe["id"]}) == (422, "supplier_not_a_source")
    assert error("PUT", url, {"supplierId": 99999}) == (422, "supplier_not_a_source")
    # "wheel" can only come from Lianfa Group: there is nothing to resolve.
    assert error("PUT", f"/api/toys/{marble['id']}/parts/{wheel['id']}/resolution", {"supplierId": lianfa}) == (422, "single_source")
    for body in (None, {}, {"supplierId": "abc"}, {"supplierId": 0}):
        assert error("PUT", url, body) == (422, "invalid_request")
    assert error("PUT", f"/api/toys/abc/parts/{part_id}/resolution", {"supplierId": lianfa}) == (422, "invalid_request")


def test_the_database_refuses_a_resolution_for_a_part_the_toy_does_not_use(data_dir):
    db = connect(finisher_db_path(data_dir, 2))
    try:
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("INSERT INTO part_resolution VALUES (1, 999999, 1, 'someone', '2026-11-11T00:00:00Z')")
    finally:
        db.close()


def test_the_api_adds_the_table_to_databases_seeded_before_it_existed(tmp_path):
    """A schema change must reach every Finisher's file, without touching recorded findings."""
    from fastapi.testclient import TestClient

    from app import config
    from app.main import create_app
    from app.seed import seed
    from tests.helpers import PASSWORD, SECRET

    seed(config.CSV_DIR, tmp_path, PASSWORD)
    for finisher_id in range(1, 9):
        db = connect(finisher_db_path(tmp_path, finisher_id))
        with db:
            db.execute("DROP TABLE part_resolution")
            db.execute("INSERT INTO child_labor_finding VALUES (1, 'someone', '2026-11-10T00:00:00Z')")
        db.close()

    with TestClient(create_app(data_dir=tmp_path, secret=SECRET)) as c:
        headers = sign_in(c, "kestrel-play", PASSWORD)
        assert c.get("/api/toys", headers=headers).status_code == 200

    for finisher_id in range(1, 9):
        db = connect(finisher_db_path(tmp_path, finisher_id))
        tables = {r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        assert "part_resolution" in tables
        assert db.execute("SELECT COUNT(*) FROM child_labor_finding").fetchone()[0] == 1
        db.close()
