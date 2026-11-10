"""Constants and helpers shared by the API tests."""

PASSWORD = "test-password"
SECRET = "test-secret-that-is-long-enough-for-hs256"

# (username, finisher id, finisher name, finisher code in the CSVs)
USERS = [
    ("brightwell-toys", 1, "Brightwell Toys", "FIN-001"),
    ("kestrel-play", 2, "Kestrel Play", "FIN-002"),
    ("moonpath-brands", 3, "Moonpath Brands", "FIN-003"),
    ("arbor-finch", 4, "Arbor & Finch", "FIN-004"),
    ("halcyon-toyworks", 5, "Halcyon Toyworks", "FIN-005"),
    ("nordlys-leker", 6, "Nordlys Leker", "FIN-006"),
    ("papercrane-ltd", 7, "Papercrane Ltd", "FIN-007"),
    ("vega-playthings", 8, "Vega Playthings", "FIN-008"),
]


def sign_in(client, username, password=PASSWORD) -> dict:
    """Sign in and return the headers to send with later requests."""
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def supplier_named(client, headers, name) -> dict:
    suppliers = client.get("/api/suppliers", headers=headers).json()["suppliers"]
    return next(s for s in suppliers if s["name"] == name)


def toy_coded(client, headers, code) -> dict:
    toys = client.get("/api/toys", headers=headers).json()["toys"]
    return next(t for t in toys if t["code"] == code)


def finding_count(data_dir, finisher_id) -> int:
    """Read a Finisher's database directly, bypassing the API."""
    from app.db import connect, finisher_db_path

    db = connect(finisher_db_path(data_dir, finisher_id))
    try:
        return db.execute("SELECT COUNT(*) FROM child_labor_finding").fetchone()[0]
    finally:
        db.close()
