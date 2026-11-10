"""Data isolation between Finishers: what the assignment says it assesses.

Kestrel Play (Finisher 2) and Moonpath Brands (Finisher 3) are the two users.
"""

import csv

import pytest

from app import config
from tests.helpers import USERS, finding_count, sign_in, supplier_named, toy_coded

DATA_ENDPOINTS = [
    ("GET", "/api/me"),
    ("GET", "/api/toys"),
    ("GET", "/api/toys/1"),
    ("GET", "/api/suppliers"),
    ("GET", "/api/suppliers/1"),
    ("PUT", "/api/suppliers/1/finding"),
    ("DELETE", "/api/suppliers/1/finding"),
]


@pytest.fixture
def kestrel(client):
    return sign_in(client, "kestrel-play")


@pytest.fixture
def moonpath(client):
    return sign_in(client, "moonpath-brands")


def test_the_list_above_covers_every_endpoint_except_login(app):
    """So a new endpoint cannot be added without also being checked here."""
    documented = {
        (method.upper(), path.replace("{toy_id}", "1").replace("{supplier_id}", "1"))
        for path, methods in app.openapi()["paths"].items()
        for method in methods
    }
    assert documented == set(DATA_ENDPOINTS) | {("POST", "/api/auth/login")}


@pytest.mark.parametrize("method, path", DATA_ENDPOINTS)
@pytest.mark.parametrize("authorization", [None, "Bearer not-a-token", "Basic a2VzdHJlbDp4"])
def test_every_data_endpoint_refuses_a_request_without_a_valid_token(client, data_dir, method, path, authorization):
    headers = {"Authorization": authorization} if authorization else {}
    response = client.request(method, path, headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"
    # And the refused PUT recorded nothing, for anyone.
    assert sum(finding_count(data_dir, finisher_id) for _u, finisher_id, _n, _c in USERS) == 0


def test_the_same_url_shows_each_user_their_own_record(client, kestrel, moonpath, toy_codes_by_finisher):
    """Ids repeat across Finishers: toy 1 exists in both databases and is a different toy."""
    for toy_id in (1, 2, 20, 37):
        mine = client.get(f"/api/toys/{toy_id}", headers=kestrel).json()["toy"]
        theirs = client.get(f"/api/toys/{toy_id}", headers=moonpath).json()["toy"]
        assert mine["code"] in toy_codes_by_finisher["FIN-002"]
        assert theirs["code"] in toy_codes_by_finisher["FIN-003"]
        assert mine["code"] != theirs["code"]


def test_a_toy_id_that_only_the_larger_finisher_has_is_404_for_the_other(client, kestrel, moonpath):
    """Kestrel Play has 40 toys, Moonpath Brands 37. Toy 40 is not Moonpath's to see."""
    assert client.get("/api/toys/40", headers=kestrel).status_code == 200
    response = client.get("/api/toys/40", headers=moonpath)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "toy_not_found"


def test_a_finding_by_one_finisher_changes_nothing_for_another(client, kestrel, moonpath, data_dir):
    """Lianfa Group is a supplier of both. Kestrel Play flags it; Moonpath Brands sees nothing."""
    theirs_before = {
        "toys": client.get("/api/toys", headers=moonpath).json(),
        "suppliers": client.get("/api/suppliers", headers=moonpath).json(),
    }
    mine = supplier_named(client, kestrel, "Lianfa Group")
    theirs = supplier_named(client, moonpath, "Lianfa Group")
    assert mine["code"] == theirs["code"] == "SUP-028"

    client.put(f"/api/suppliers/{mine['id']}/finding", headers=kestrel)

    assert client.get("/api/toys", headers=kestrel).json()["summary"]["affected"] == 13
    assert client.get("/api/toys", headers=moonpath).json() == theirs_before["toys"]
    assert client.get("/api/suppliers", headers=moonpath).json() == theirs_before["suppliers"]
    assert client.get(f"/api/suppliers/{theirs['id']}", headers=moonpath).json()["supplier"]["finding"] is None
    # Checked in the files too, not only through the API.
    assert [finding_count(data_dir, finisher_id) for _u, finisher_id, _n, _c in USERS] == [0, 1, 0, 0, 0, 0, 0, 0]


def test_another_finisher_cannot_withdraw_my_finding(client, kestrel, moonpath, data_dir):
    """Moonpath Brands sends DELETE to the very same URL. It acts on its own supplier, not mine."""
    mine = supplier_named(client, kestrel, "Lianfa Group")
    url = f"/api/suppliers/{mine['id']}/finding"
    client.put(url, headers=kestrel)

    response = client.delete(url, headers=moonpath)
    assert response.json() == {"finding": None}

    assert supplier_named(client, kestrel, "Lianfa Group")["finding"]["recordedBy"] == "kestrel-play"
    assert client.get("/api/toys", headers=kestrel).json()["summary"]["affected"] == 13
    assert finding_count(data_dir, 2) == 1


def test_each_finisher_keeps_its_own_finding_on_the_same_supplier(client, kestrel, moonpath):
    mine = supplier_named(client, kestrel, "Lianfa Group")
    theirs = supplier_named(client, moonpath, "Lianfa Group")
    client.put(f"/api/suppliers/{mine['id']}/finding", headers=kestrel)
    client.put(f"/api/suppliers/{theirs['id']}/finding", headers=moonpath)
    assert supplier_named(client, kestrel, "Lianfa Group")["finding"]["recordedBy"] == "kestrel-play"
    assert supplier_named(client, moonpath, "Lianfa Group")["finding"]["recordedBy"] == "moonpath-brands"

    client.delete(f"/api/suppliers/{mine['id']}/finding", headers=kestrel)
    assert supplier_named(client, kestrel, "Lianfa Group")["finding"] is None
    assert supplier_named(client, moonpath, "Lianfa Group")["finding"]["recordedBy"] == "moonpath-brands"


def test_a_toy_code_listed_by_two_finishers_is_two_separate_toys(client):
    """Five toy codes appear under two Finishers. Flagging every supplier of one leaves the other untouched."""
    with open(config.CSV_DIR / "toys.csv", newline="", encoding="utf-8") as f:
        owners: dict[str, list[str]] = {}
        for row in csv.DictReader(f):
            owners.setdefault(row["toy_id"], []).append(row["finisher_id"])
    shared = {code: finishers for code, finishers in owners.items() if len(finishers) == 2}
    assert len(shared) == 5

    username_of = {code: username for username, _id, _name, code in USERS}
    for toy_code, (first, second) in shared.items():
        a, b = sign_in(client, username_of[first]), sign_in(client, username_of[second])
        for supplier in client.get("/api/suppliers", headers=a).json()["suppliers"]:
            client.put(f"/api/suppliers/{supplier['id']}/finding", headers=a)
        assert toy_coded(client, a, toy_code)["exposure"] == "affected"
        assert toy_coded(client, b, toy_code)["exposure"] == "no_finding"
        assert client.get("/api/toys", headers=b).json()["summary"]["affected"] == 0
        for supplier in client.get("/api/suppliers", headers=a).json()["suppliers"]:
            client.delete(f"/api/suppliers/{supplier['id']}/finding", headers=a)


def test_every_finisher_sees_only_suppliers_that_its_own_toys_reach(client):
    for username, _id, _name, _code in USERS:
        headers = sign_in(client, username)
        toys = client.get("/api/toys", headers=headers).json()["toys"]
        reached = set()
        for toy in toys:
            for part in client.get(f"/api/toys/{toy['id']}", headers=headers).json()["parts"]:
                reached.update(s["supplier"]["id"] for s in part["sources"])
        listed = {s["id"] for s in client.get("/api/suppliers", headers=headers).json()["suppliers"]}
        assert listed == reached
