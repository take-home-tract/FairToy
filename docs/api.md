# API

The contract between the React app and the Python API. It serves the screens in [ux.md](ux.md) and implements the rules in [spec.md](spec.md). Names follow the spec's language.

## Conventions

- JSON over HTTP, all paths under `/api`.
- Every endpoint except login needs `Authorization: Bearer <token>`. The Finisher is taken from the signed-in user, never from the path, the query or the body ([D11](decisions.md#d11-the-api-is-scoped-by-the-signed-in-user-and-findings-are-an-idempotent-sub-resource), [D16](decisions.md#d16-authentication-seeded-users-and-a-signed-token)).
- Ids in paths are the internal numeric ids from the data model and are unrelated to codes. `code` is the source reference shown on screen.
- Exposure values: `affected`, `possibly_affected`, `no_finding`.
- Times are ISO 8601 in UTC.
- Exposure is computed on every read and never stored ([D5](decisions.md#d5-exposure-is-computed-never-stored)).
- Lists are returned whole and sorted by the server (a Finisher has a few dozen toys and under 50 suppliers). There is no paging, and filtering and search happen in the browser.

## Endpoints

| Method and path | Purpose | Screen |
|---|---|---|
| `POST /api/auth/login` | Sign in, get a token | Sign in |
| `GET /api/me` | The signed-in user and their Finisher | Top bar |
| `GET /api/toys` | The Finisher's toys with exposure, plus totals | Toys |
| `GET /api/toys/{toyId}` | Trace of one toy | Toy trace |
| `GET /api/suppliers` | The Finisher's suppliers | Suppliers |
| `GET /api/suppliers/{supplierId}` | One supplier and the toys it reaches | Supplier detail, flag dialog |
| `PUT /api/suppliers/{supplierId}/finding` | Record a finding | Flag |
| `DELETE /api/suppliers/{supplierId}/finding` | Withdraw a finding | Withdraw, undo |

"The Finisher" below always means the signed-in user's Finisher.

### POST /api/auth/login

```json
{ "username": "kestrel-play", "password": "..." }
```

Returns a signed token that expires, plus who signed in. Wrong credentials give 401 without saying which part was wrong.

```json
{
  "token": "<signed token>",
  "user": { "id": 2, "username": "kestrel-play" },
  "finisher": { "id": 2, "name": "Kestrel Play" }
}
```

Signing out is done in the browser by discarding the token.

### GET /api/me

```json
{ "user": { "id": 2, "username": "kestrel-play" }, "finisher": { "id": 2, "name": "Kestrel Play" } }
```

### GET /api/toys

Sorted by exposure (affected first), then name. `partsTouched` is how many of the toy's parts have at least one implicated supplier.

```json
{
  "summary": { "total": 40, "affected": 13, "possiblyAffected": 9, "noFinding": 18 },
  "toys": [
    { "id": 187, "code": "TOY-0290", "name": "Marble Digger",
      "exposure": "affected", "partsTouched": 2, "partCount": 22 }
  ]
}
```

### GET /api/toys/{toyId}

Parts are sorted with exposed parts first. Each part lists every possible source.

```json
{
  "toy": { "id": 163, "code": "TOY-0029", "name": "Lantern Crane", "exposure": "possibly_affected" },
  "parts": [
    { "id": 117, "code": "PRT-0117", "name": "soft filling", "exposure": "possibly_affected",
      "sources": [
        { "supplier": { "id": 28, "name": "Lianfa Group", "country": "Turkey" },
          "factory": { "name": "Lianfa Group — Cavite Plant", "country": "Philippines" },
          "hasFinding": true },
        { "supplier": { "id": 19, "name": "Everstar Fabrication", "country": "Poland" },
          "factory": { "name": "Everstar Fabrication — Katowice Plant", "country": "Poland" },
          "hasFinding": false }
      ] }
  ]
}
```

The UI builds the "why" sentence from `exposure` and `sources`; the API sends no prose.

### GET /api/suppliers

Only the Finisher's own suppliers are returned. `toysReached` is how many of its toys use a part this supplier can make.

```json
{
  "suppliers": [
    { "id": 28, "code": "SUP-028", "name": "Lianfa Group", "country": "Turkey",
      "toysReached": 22, "finding": { "recordedAt": "2026-11-10T14:02:11Z", "recordedBy": "kestrel-play" } },
    { "id": 35, "code": "SUP-035", "name": "Sanhe Precision", "country": "Poland",
      "toysReached": 27, "finding": null }
  ]
}
```

### GET /api/suppliers/{supplierId}

Returns each reached toy twice, as it is now and as it would be with a finding. This feeds both the detail view and the flag dialog's preview. If a finding already exists, the two values are equal.

```json
{
  "supplier": { "id": 28, "code": "SUP-028", "name": "Lianfa Group", "country": "Turkey", "finding": null },
  "toys": [
    { "id": 187, "code": "TOY-0290", "name": "Marble Digger",
      "exposureNow": "no_finding", "exposureIfFlagged": "affected" }
  ]
}
```

### PUT and DELETE /api/suppliers/{supplierId}/finding

- `PUT` records a finding. No body. `DELETE` withdraws it.
- Both are **idempotent**: recording twice or withdrawing twice is not an error and changes nothing the second time.
- Both return the new finding state and the new toy totals, so the UI can show the message and refresh without extra calls.

```json
{
  "finding": { "recordedAt": "2026-11-10T14:02:11Z", "recordedBy": "kestrel-play" },
  "summary": { "total": 40, "affected": 13, "possiblyAffected": 9, "noFinding": 18 }
}
```

After `DELETE`, `finding` is `null`.

## Errors

```json
{ "error": { "code": "supplier_not_found", "message": "No such supplier for this Finisher." } }
```

| Status | Code | When |
|---|---|---|
| 401 | `invalid_credentials` | Wrong username or password at login |
| 401 | `not_authenticated` | Missing, invalid or expired token |
| 404 | `toy_not_found` | Unknown toy, or a toy of another Finisher |
| 404 | `supplier_not_found` | Unknown supplier, or a supplier of another Finisher |

Isolation: another Finisher's toy or supplier answers 404, the same as one that does not exist, so nothing leaks. Every record belongs to one Finisher, so a user can never see, flag or withdraw anything outside their own ([D2](decisions.md#d2-all-of-a-finishers-data-belongs-to-it)).

## Not in the API

Sign up, password reset, roles, managing users; creating, editing or deleting toys, parts or suppliers; uploading data; findings with a reason or history; paging. All are out of scope or deferred ([spec.md](spec.md)).
