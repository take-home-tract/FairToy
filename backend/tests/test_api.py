"""The data endpoints against the acceptance checklist in docs/spec.md.

Numbers come from the sample data: Kestrel Play has 40 toys, and Lianfa Group
reaches 22 of them (13 affected, 9 possibly affected).
"""

import re

import pytest

from tests.helpers import USERS, sign_in, supplier_named, toy_coded


@pytest.fixture
def kestrel(client):
    return sign_in(client, "kestrel-play")


def flag(client, headers, name) -> dict:
    supplier = supplier_named(client, headers, name)
    response = client.put(f"/api/suppliers/{supplier['id']}/finding", headers=headers)
    assert response.status_code == 200
    return supplier


def exposures(client, headers) -> dict:
    """toy code -> exposure"""
    return {t["code"]: t["exposure"] for t in client.get("/api/toys", headers=headers).json()["toys"]}


# --- 1. a user sees only their Finisher's toys, parts and suppliers ---


@pytest.mark.parametrize("username, _id, _name, code", USERS)
def test_each_user_lists_exactly_its_finishers_toys(client, toy_codes_by_finisher, username, _id, _name, code):
    body = client.get("/api/toys", headers=sign_in(client, username)).json()
    assert sorted(t["code"] for t in body["toys"]) == toy_codes_by_finisher[code]
    assert body["summary"]["total"] == len(toy_codes_by_finisher[code])


def test_with_no_findings_every_toy_has_no_finding_and_is_sorted_by_name(client, kestrel):
    body = client.get("/api/toys", headers=kestrel).json()
    assert body["summary"] == {"total": 40, "affected": 0, "possiblyAffected": 0, "noFinding": 40}
    assert {t["exposure"] for t in body["toys"]} == {"no_finding"}
    assert {t["partsTouched"] for t in body["toys"]} == {0}
    names = [t["name"].lower() for t in body["toys"]]
    assert names == sorted(names)
    assert set(body["toys"][0]) == {"id", "code", "name", "exposure", "partsTouched", "partCount"}


# --- 2. each toy shows its parts, and each part its possible sources ---


def test_toy_trace_lists_every_part_with_at_least_one_source(client, kestrel):
    toy = toy_coded(client, kestrel, "TOY-0290")
    body = client.get(f"/api/toys/{toy['id']}", headers=kestrel).json()
    assert body["toy"] == {"id": toy["id"], "code": "TOY-0290", "name": "Marble Digger", "exposure": "no_finding"}
    assert len(body["parts"]) == toy["partCount"] == 22
    for part in body["parts"]:
        assert part["exposure"] == "no_finding"
        assert len(part["sources"]) >= 1
        for source in part["sources"]:
            assert source["hasFinding"] is False
            assert set(source["supplier"]) == {"id", "name", "country"}
            assert set(source["factory"]) == {"name", "country"}


# --- 3. recording a finding changes exactly the toys that reach the supplier ---


def test_flagging_lianfa_gives_13_affected_9_possibly_18_no_finding(client, kestrel):
    before = exposures(client, kestrel)
    lianfa = flag(client, kestrel, "Lianfa Group")
    reached = {t["code"] for t in client.get(f"/api/suppliers/{lianfa['id']}", headers=kestrel).json()["toys"]}
    assert len(reached) == 22

    body = client.get("/api/toys", headers=kestrel).json()
    assert body["summary"] == {"total": 40, "affected": 13, "possiblyAffected": 9, "noFinding": 18}
    # Sorted: affected first, then possibly affected, then no finding.
    assert [t["exposure"] for t in body["toys"]] == ["affected"] * 13 + ["possibly_affected"] * 9 + ["no_finding"] * 18
    # Exactly the reached toys changed.
    after = {t["code"]: t["exposure"] for t in body["toys"]}
    assert {code for code in after if after[code] != before[code]} == reached
    for toy in body["toys"]:
        assert (toy["partsTouched"] > 0) == (toy["code"] in reached)


def test_affected_toy_shows_its_path_to_the_flagged_supplier(client, kestrel):
    flag(client, kestrel, "Lianfa Group")
    toy = toy_coded(client, kestrel, "TOY-0290")
    body = client.get(f"/api/toys/{toy['id']}", headers=kestrel).json()
    assert body["toy"]["exposure"] == "affected"

    # Exposed parts come first.
    wheel, zip_fastener, *others = body["parts"]
    assert {p["exposure"] for p in others} == {"no_finding"}

    # "wheel" can only come from Lianfa Group: affected.
    assert (wheel["name"], wheel["exposure"]) == ("wheel", "affected")
    assert [(s["supplier"]["name"], s["hasFinding"]) for s in wheel["sources"]] == [("Lianfa Group", True)]

    # "zip fastener" has an alternative: possibly affected. The flagged source is listed first.
    assert (zip_fastener["name"], zip_fastener["exposure"]) == ("zip fastener", "possibly_affected")
    assert [(s["supplier"]["name"], s["hasFinding"]) for s in zip_fastener["sources"]] == [
        ("Lianfa Group", True),
        ("Pacific Precision", False),
    ]


def test_possibly_affected_toy_shows_the_alternative_source(client, kestrel):
    flag(client, kestrel, "Lianfa Group")
    toy = toy_coded(client, kestrel, "TOY-0029")
    body = client.get(f"/api/toys/{toy['id']}", headers=kestrel).json()
    assert body["toy"]["exposure"] == "possibly_affected"
    soft_filling = body["parts"][0]
    assert (soft_filling["name"], soft_filling["exposure"]) == ("soft filling", "possibly_affected")
    assert soft_filling["sources"] == [
        {
            "supplier": {"id": soft_filling["sources"][0]["supplier"]["id"], "name": "Lianfa Group", "country": "Turkey"},
            "factory": {"name": "Lianfa Group — Cavite Plant", "country": "Philippines"},
            "hasFinding": True,
        },
        {
            "supplier": {"id": soft_filling["sources"][1]["supplier"]["id"], "name": "Everstar Fabrication", "country": "Thailand"},
            "factory": {"name": "Everstar Fabrication — Katowice Plant", "country": "Poland"},
            "hasFinding": False,
        },
    ]
    assert {p["exposure"] for p in body["parts"][1:]} == {"no_finding"}


def test_flagging_the_alternative_too_turns_possibly_into_affected(client, kestrel):
    flag(client, kestrel, "Lianfa Group")
    assert toy_coded(client, kestrel, "TOY-0029")["exposure"] == "possibly_affected"
    flag(client, kestrel, "Everstar Fabrication")
    assert toy_coded(client, kestrel, "TOY-0029")["exposure"] == "affected"


# --- the preview (supplier detail) ---


def test_preview_before_flagging_lianfa(client, kestrel):
    lianfa = supplier_named(client, kestrel, "Lianfa Group")
    body = client.get(f"/api/suppliers/{lianfa['id']}", headers=kestrel).json()
    assert body["supplier"] == {"id": lianfa["id"], "code": "SUP-028", "name": "Lianfa Group", "country": "Turkey", "finding": None}
    assert len(body["toys"]) == 22
    assert {t["exposureNow"] for t in body["toys"]} == {"no_finding"}
    would_be = [t["exposureIfFlagged"] for t in body["toys"]]
    assert (would_be.count("affected"), would_be.count("possibly_affected")) == (13, 9)
    # Reading the preview records nothing.
    assert client.get("/api/toys", headers=kestrel).json()["summary"]["noFinding"] == 40


def test_the_preview_of_every_supplier_matches_what_flagging_it_then_does(client, kestrel):
    """With another finding already in place, so some toys are exposed before."""
    flag(client, kestrel, "Sanhe Precision")
    suppliers = client.get("/api/suppliers", headers=kestrel).json()["suppliers"]
    assert len(suppliers) == 49
    for supplier in suppliers:
        if supplier["name"] == "Sanhe Precision":
            continue
        url = f"/api/suppliers/{supplier['id']}"
        before = exposures(client, kestrel)
        preview = client.get(url, headers=kestrel).json()["toys"]
        assert len(preview) == supplier["toysReached"]
        assert {t["code"]: t["exposureNow"] for t in preview} == {t["code"]: before[t["code"]] for t in preview}

        client.put(f"{url}/finding", headers=kestrel)
        after = exposures(client, kestrel)
        assert {t["code"]: t["exposureIfFlagged"] for t in preview} == {t["code"]: after[t["code"]] for t in preview}
        # Toys the supplier does not reach did not change.
        untouched = set(before) - {t["code"] for t in preview}
        assert all(after[code] == before[code] for code in untouched)
        # Once flagged, now and if-flagged are equal.
        assert all(t["exposureNow"] == t["exposureIfFlagged"] for t in client.get(url, headers=kestrel).json()["toys"])

        client.delete(f"{url}/finding", headers=kestrel)
        assert exposures(client, kestrel) == before


# --- 5. withdrawing restores the previous statuses; both writes are idempotent ---


def test_withdrawing_restores_the_previous_toy_list(client, kestrel):
    before = client.get("/api/toys", headers=kestrel).json()
    lianfa = flag(client, kestrel, "Lianfa Group")
    assert client.get("/api/toys", headers=kestrel).json() != before
    response = client.delete(f"/api/suppliers/{lianfa['id']}/finding", headers=kestrel)
    assert (response.status_code, response.json()) == (200, {"finding": None})
    assert client.get("/api/toys", headers=kestrel).json() == before


def test_recording_returns_who_and_when_and_recording_twice_changes_nothing(client, kestrel, data_dir):
    lianfa = supplier_named(client, kestrel, "Lianfa Group")
    url = f"/api/suppliers/{lianfa['id']}/finding"
    first = client.put(url, headers=kestrel)
    assert first.status_code == 200
    finding = first.json()["finding"]
    assert finding["recordedBy"] == "kestrel-play"
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", finding["recordedAt"])

    # Make the stored time recognizably old, then record again: it must not be replaced.
    from app.db import connect, finisher_db_path

    db = connect(finisher_db_path(data_dir, 2))
    with db:
        db.execute("UPDATE child_labor_finding SET recorded_at = '2026-01-01T00:00:00Z'")
    db.close()
    second = client.put(url, headers=kestrel)
    assert second.status_code == 200
    assert second.json() == {"finding": {"recordedAt": "2026-01-01T00:00:00Z", "recordedBy": "kestrel-play"}}
    assert supplier_named(client, kestrel, "Lianfa Group")["finding"] == second.json()["finding"]


def test_withdrawing_twice_or_with_no_finding_is_not_an_error(client, kestrel):
    lianfa = supplier_named(client, kestrel, "Lianfa Group")
    url = f"/api/suppliers/{lianfa['id']}/finding"
    assert client.delete(url, headers=kestrel).json() == {"finding": None}
    client.put(url, headers=kestrel)
    assert client.delete(url, headers=kestrel).json() == {"finding": None}
    assert client.delete(url, headers=kestrel).json() == {"finding": None}


# --- 7. the suppliers list ---


def test_suppliers_list_shows_own_suppliers_toys_reached_and_finding_state(client, kestrel):
    suppliers = client.get("/api/suppliers", headers=kestrel).json()["suppliers"]
    assert len(suppliers) == 49
    assert [s["name"].lower() for s in suppliers] == sorted(s["name"].lower() for s in suppliers)
    assert "SUP-038" not in {s["code"] for s in suppliers}  # makes no part, so it is in nobody's chain
    assert all(s["finding"] is None and s["toysReached"] >= 1 for s in suppliers)
    by_name = {s["name"]: s for s in suppliers}
    assert by_name["Lianfa Group"] == {
        "id": by_name["Lianfa Group"]["id"], "code": "SUP-028", "name": "Lianfa Group",
        "country": "Turkey", "toysReached": 22, "finding": None,
    }
    assert by_name["Sanhe Precision"]["toysReached"] == 27

    flag(client, kestrel, "Lianfa Group")
    flagged = [s for s in client.get("/api/suppliers", headers=kestrel).json()["suppliers"] if s["finding"]]
    assert [s["name"] for s in flagged] == ["Lianfa Group"]
    assert flagged[0]["finding"]["recordedBy"] == "kestrel-play"


# --- errors ---


def test_unknown_ids_are_404_and_malformed_ids_are_422(client, kestrel):
    def error(method, path):
        response = client.request(method, path, headers=kestrel)
        return response.status_code, response.json()["error"]["code"]

    assert error("GET", "/api/toys/99999") == (404, "toy_not_found")
    assert error("GET", "/api/suppliers/99999") == (404, "supplier_not_found")
    assert error("PUT", "/api/suppliers/99999/finding") == (404, "supplier_not_found")
    assert error("DELETE", "/api/suppliers/99999/finding") == (404, "supplier_not_found")
    for bad in ("abc", "0", "-1", "1.5", "99999999999999999999999"):
        assert error("GET", f"/api/toys/{bad}") == (422, "invalid_request")
        assert error("GET", f"/api/suppliers/{bad}") == (422, "invalid_request")
        assert error("PUT", f"/api/suppliers/{bad}/finding") == (422, "invalid_request")
        assert error("DELETE", f"/api/suppliers/{bad}/finding") == (422, "invalid_request")
    assert error("POST", "/api/suppliers/1/finding") == (405, "method_not_allowed")
