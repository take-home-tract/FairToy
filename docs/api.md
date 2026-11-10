# API

The contract between the React app and the Python API. It serves the screens in [ux.md](ux.md) and implements the rules in [spec.md](spec.md). Names follow the spec's language.

## Conventions

- JSON over HTTP, all paths under `/api`.
- Everything is scoped to a Finisher in the path: `/api/finishers/{finisherId}/...`. There is no login, so the path is the only context ([D1](decisions.md#d1-one-finishers-viewpoint)).
- Ids in paths are the internal numeric ids from the data model and are unrelated to codes. `code` is the source reference shown on screen.
- Exposure values: `affected`, `possibly_affected`, `no_finding`.
- Times are ISO 8601 in UTC.
- Exposure is computed on every read and never stored ([D5](decisions.md#d5-exposure-is-computed-never-stored)).
- Lists are returned whole and sorted by the server (a Finisher has a few dozen toys and under 50 suppliers). There is no paging, and filtering and search happen in the browser.

## Endpoints

| Method and path | Purpose | Screen |
|---|---|---|
| `GET /api/finishers` | List Finishers | Picker |
| `GET /api/finishers/{fid}/toys` | Toys with exposure, plus totals | Toys |
| `GET /api/finishers/{fid}/toys/{toyId}` | Trace of one toy | Toy trace |
| `GET /api/finishers/{fid}/suppliers` | Suppliers the Finisher's toys reach | Suppliers |
| `GET /api/finishers/{fid}/suppliers/{supplierId}` | One supplier and the toys it reaches | Supplier detail, flag dialog |
| `PUT /api/finishers/{fid}/suppliers/{supplierId}/finding` | Record a finding | Flag |
| `DELETE /api/finishers/{fid}/suppliers/{supplierId}/finding` | Withdraw a finding | Withdraw, undo |

### GET /api/finishers

```json
[{ "id": 2, "name": "Kestrel Play" }]
```

### GET /api/finishers/{fid}/toys

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

### GET /api/finishers/{fid}/toys/{toyId}

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

### GET /api/finishers/{fid}/suppliers

Only suppliers reached by the Finisher's toys are returned.

```json
{
  "suppliers": [
    { "id": 28, "code": "SUP-028", "name": "Lianfa Group", "country": "Turkey",
      "toysReached": 22, "finding": { "recordedAt": "2026-11-10T14:02:11Z" } },
    { "id": 35, "code": "SUP-035", "name": "Sanhe Precision", "country": "Poland",
      "toysReached": 27, "finding": null }
  ]
}
```

### GET /api/finishers/{fid}/suppliers/{supplierId}

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

### PUT and DELETE .../suppliers/{supplierId}/finding

- `PUT` records a finding. No body. `DELETE` withdraws it.
- Both are **idempotent**: recording twice or withdrawing twice is not an error and changes nothing the second time.
- Both return the new finding state and the new toy totals, so the UI can show the message and refresh without extra calls.

```json
{
  "finding": { "recordedAt": "2026-11-10T14:02:11Z" },
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
| 404 | `finisher_not_found` | Unknown Finisher |
| 404 | `toy_not_found` | The toy does not belong to this Finisher |
| 404 | `supplier_not_found` | Unknown supplier, or one this Finisher's toys do not reach |

The last one is the isolation rule: a Finisher cannot record a finding on a supplier its toys do not reach ([D2](decisions.md#d2-findings-belong-to-the-finisher-reference-data-is-shared)).

## Not in the API

Creating, editing or deleting toys, parts or suppliers; uploading data; findings with a reason or history; paging. All are out of scope or deferred ([spec.md](spec.md)).
