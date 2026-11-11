# API

The contract between the React app and the Python API. It serves the screens in [ux.md](ux.md) and implements the rules in [spec.md](spec.md). Names follow the spec's language.

## Conventions

- JSON over HTTP, all paths under `/api`.
- Every endpoint except login needs `Authorization: Bearer <token>`. The Finisher is taken from the signed-in user, never from the path, the query or the body ([D11](decisions.md#d11-the-api-is-scoped-by-the-signed-in-user-and-findings-are-an-idempotent-sub-resource), [D16](decisions.md#d16-authentication-seeded-users-and-a-signed-token)).
- Ids in paths are the internal numeric ids from the data model and are unrelated to codes. They only mean something inside one Finisher: the same id names a different record for another Finisher ([D17](decisions.md#d17-isolation-is-structural-one-database-per-finisher)). `code` is the source reference shown on screen.
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
| `PUT /api/toys/{toyId}/parts/{partId}/resolution` | Record which supplier made this part of this toy | Toy trace |
| `DELETE /api/toys/{toyId}/parts/{partId}/resolution` | Withdraw that | Toy trace, undo |

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

Sorted by exposure (affected first), then name. `partsTouched` is how many of the toy's parts have at least one implicated supplier. `flaggedSuppliers` names the implicated suppliers that can make one of the toy's parts; it is empty for a toy with no finding.

```json
{
  "summary": { "total": 40, "affected": 13, "possiblyAffected": 9, "noFinding": 18 },
  "toys": [
    { "id": 187, "code": "TOY-0290", "name": "Marble Digger",
      "exposure": "affected", "partsTouched": 2, "partCount": 22,
      "flaggedSuppliers": [{ "id": 31, "name": "Lianfa Group" }] }
  ]
}
```

### GET /api/toys/{toyId}

Parts are sorted with exposed parts first. Each part lists every possible source, and `resolution` says which one the Finisher recorded as used (`null` when it has not). The exposure of a resolved part counts only the recorded supplier.

```json
{
  "toy": { "id": 163, "code": "TOY-0029", "name": "Lantern Crane", "exposure": "possibly_affected" },
  "parts": [
    { "id": 204, "code": "PRT-0117", "name": "soft filling", "exposure": "possibly_affected",
      "sources": [
        { "supplier": { "id": 31, "name": "Lianfa Group", "country": "Turkey" },
          "factory": { "name": "Lianfa Group — Cavite Plant", "country": "Philippines" },
          "hasFinding": true },
        { "supplier": { "id": 12, "name": "Everstar Fabrication", "country": "Thailand" },
          "factory": { "name": "Everstar Fabrication — Katowice Plant", "country": "Poland" },
          "hasFinding": false }
      ],
      "resolution": null }
  ]
}
```

After a resolution, the same part reads:

```json
{ "id": 204, "code": "PRT-0117", "name": "soft filling", "exposure": "no_finding",
  "sources": [ "...both sources, as above..." ],
  "resolution": { "supplier": { "id": 12, "name": "Everstar Fabrication" },
                  "recordedAt": "2026-11-11T09:12:40Z", "recordedBy": "kestrel-play" } }
```

The UI builds the "why" sentence from `exposure` and `sources`; the API sends no prose.

### GET /api/suppliers

Only the Finisher's own suppliers are returned. `partCount` is how many of the Finisher's parts this supplier can make, and `toysReached` is how many of its toys use one of them.

```json
{
  "suppliers": [
    { "id": 31, "code": "SUP-028", "name": "Lianfa Group", "country": "Turkey",
      "partCount": 8, "toysReached": 22, "finding": { "recordedAt": "2026-11-10T14:02:11Z", "recordedBy": "kestrel-play" } },
    { "id": 38, "code": "SUP-035", "name": "Sanhe Precision", "country": "Poland",
      "partCount": 9, "toysReached": 27, "finding": null }
  ]
}
```

### GET /api/suppliers/{supplierId}

Returns the parts this supplier can make for the Finisher, and the toys it reaches through them.

- `parts`: each part with the factories where this supplier makes it, the other suppliers that can make it (`otherSuppliers`, empty when this supplier is the only source), and how many toys use it.
- `toys`: each reached toy twice, as it is now and as it would be with a finding, plus `partIds`: the parts from `parts` that connect it to this supplier. If a finding already exists, the two exposure values are equal.

This feeds the detail view and the flag dialog's preview.

```json
{
  "supplier": { "id": 31, "code": "SUP-028", "name": "Lianfa Group", "country": "Turkey", "finding": null },
  "parts": [
    { "id": 213, "code": "PRT-0223", "name": "wheel",
      "factories": [{ "name": "Lianfa Group — Cavite Plant", "country": "Philippines" }],
      "otherSuppliers": [], "toyCount": 3 },
    { "id": 43, "code": "PRT-0044", "name": "zip fastener",
      "factories": [{ "name": "Lianfa Group — Rayong Plant", "country": "Thailand" }],
      "otherSuppliers": [{ "id": 12, "name": "Pacific Precision" }], "toyCount": 6 }
  ],
  "toys": [
    { "id": 187, "code": "TOY-0290", "name": "Marble Digger",
      "exposureNow": "no_finding", "exposureIfFlagged": "affected", "partIds": [213, 43] }
  ]
}
```

### PUT and DELETE /api/suppliers/{supplierId}/finding

- `PUT` records a finding. No body. `DELETE` withdraws it.
- Both are **idempotent**: recording twice or withdrawing twice is not an error and changes nothing the second time.
- Both return the new finding state. The UI then refetches the lists it is showing, so the server stays the only source of truth ([design.md](design.md)).

```json
{ "finding": { "recordedAt": "2026-11-10T14:02:11Z", "recordedBy": "kestrel-play" } }
```

After `DELETE`, `finding` is `null`.

### PUT and DELETE /api/toys/{toyId}/parts/{partId}/resolution

- `PUT` records which supplier made this part of this toy, for example from purchase records:

  ```json
  { "supplierId": 12 }
  ```

  The supplier must be one of the part's possible sources, and the part must have more than one. Recording the same supplier again changes nothing; recording another one replaces it, with the new who and when.
- `DELETE` withdraws it, and is idempotent.
- Both return the new state; the UI refetches what it shows, as for findings.

```json
{ "resolution": { "supplier": { "id": 12, "name": "Everstar Fabrication" },
                  "recordedAt": "2026-11-11T09:12:40Z", "recordedBy": "kestrel-play" } }
```

After `DELETE`, `resolution` is `null`. A resolution also changes what the supplier endpoints count: a toy whose only link to a supplier is a part resolved to another supplier is no longer reached by it.

`GET /api/toys` gives each toy a `partsResolved` count.

## Errors

```json
{ "error": { "code": "supplier_not_found", "message": "No such supplier for this Finisher." } }
```

Every error uses this shape, including the framework's own validation errors, through one error handler.

| Status | Code | When |
|---|---|---|
| 401 | `invalid_credentials` | Wrong username or password at login |
| 401 | `not_authenticated` | Missing, invalid or expired token |
| 404 | `toy_not_found` | Unknown toy, or a toy of another Finisher |
| 404 | `supplier_not_found` | Unknown supplier, or a supplier of another Finisher |
| 404 | `part_not_found` | The toy does not use that part |
| 422 | `invalid_request` | A malformed request, for example an id that is not a number |
| 422 | `supplier_not_a_source` | A resolution names a supplier that cannot make the part |
| 422 | `single_source` | A resolution for a part with only one possible supplier: there is nothing to resolve |

Isolation: a request only ever opens the database of the signed-in user's Finisher ([D17](decisions.md#d17-isolation-is-structural-one-database-per-finisher)). Another Finisher's toy or supplier does not exist there, so it answers 404 like any unknown id and nothing leaks. A user can never see, flag or withdraw anything outside their own Finisher ([D2](decisions.md#d2-all-of-a-finishers-data-belongs-to-it)).

## Not in the API

Sign up, password reset, roles, managing users; creating, editing or deleting toys, parts or suppliers; uploading data; findings or resolutions with a reason or history; paging. All are out of scope or deferred ([spec.md](spec.md)).
