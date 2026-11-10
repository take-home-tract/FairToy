# Design

How FairToy is built. It is derived from [spec.md](spec.md): the rules live there, and the reasons for each choice live in [decisions.md](decisions.md).

## System design

```mermaid
flowchart LR
    IN[/Data entry or upload/] -.->|future| API
    subgraph App
        UI[React frontend] <-->|JSON over HTTP| API[Python API]
        API <--> DB[(Relational database)]
    end
    F((Finisher)) --> UI
    PR[/Purchase records system/] -.->|future: validate possibly affected| API
    BM[/Basic Materials data/] -.->|future: new branch in the trace| API
```

Solid lines are in scope. Dotted lines are extension points and are **not built** ([D7](decisions.md#d7-basic-materials-and-purchase-records-are-out-of-scope)). The database is assumed to already hold the data; entering or uploading it is out of scope ([D6](decisions.md#d6-data-is-assumed-already-loaded)). Exposure is computed on read from the current findings ([D5](decisions.md#d5-exposure-is-computed-never-stored)).

## Sequence

```mermaid
sequenceDiagram
    actor F as Finisher
    participant UI as React UI
    participant API as Python API
    participant DB as Database

    F->>UI: Select Finisher
    UI->>API: GET toys
    API->>DB: toys + exposure
    API-->>UI: toy list with exposure (filterable)

    F->>UI: Open a toy
    UI->>API: GET toy trace
    API->>DB: parts, factories, suppliers
    API-->>UI: toy -> part -> supplier paths

    F->>UI: Open suppliers
    UI->>API: GET suppliers
    API->>DB: suppliers reached by the toys + findings
    API-->>UI: supplier list with finding state

    F->>UI: Flag supplier
    UI->>API: POST child labor finding
    API->>DB: store finding
    UI->>API: GET toys
    API-->>UI: Affected / Possibly affected / No finding, with paths

    F->>UI: Withdraw finding
    UI->>API: DELETE child labor finding
    API->>DB: remove finding
    UI->>API: GET toys
    API-->>UI: exposure recomputed
```

## Data model

Shaped around the questions we answer, not around the CSV files: *which toys use which parts, and which suppliers can make each part?* The trace is two hops, toy to part to supplier.

```mermaid
erDiagram
    FINISHER ||--o{ TOY : owns
    FINISHER ||--o{ CHILD_LABOR_FINDING : records
    SUPPLIER ||--o{ CHILD_LABOR_FINDING : "subject of"
    TOY ||--o{ TOY_PART : requires
    PART ||--o{ TOY_PART : "used in"
    PART ||--o{ PART_SOURCE : "made by"
    SUPPLIER ||--o{ PART_SOURCE : makes

    FINISHER { int id PK
        string name }
    TOY { int id PK
        int finisher_id FK
        string code
        string name }
    PART { int id PK
        string code
        string name }
    SUPPLIER { int id PK
        string code
        string name
        string country }
    TOY_PART { int toy_id FK
        int part_id FK }
    PART_SOURCE { int part_id FK
        int supplier_id FK
        string factory_name
        string factory_country }
    CHILD_LABOR_FINDING { int finisher_id "PK, FK"
        int supplier_id "PK, FK"
        datetime recorded_at }
```

- **Ownership.** Only the toy and the finding belong to a Finisher. Parts and suppliers are shared, read-only reference data with no owner. A Finisher's world is what its toys reach: toy, then parts, then suppliers ([D2](decisions.md#d2-findings-belong-to-the-finisher-reference-data-is-shared)). `code` is the source reference (for example `TOY-0275`), shown on screen.
- **The finding is keyed by Finisher and supplier.** A Finisher has at most one finding per supplier, and one Finisher's findings never appear in another's view. It is the only record the app creates. Everything else is read-only data assumed to be in place ([D4](decisions.md#d4-a-finding-can-be-recorded-and-withdrawn-with-no-history), [D6](decisions.md#d6-data-is-assumed-already-loaded)).
- **Factory is a detail, not a record.** Where a part is made is two plain fields on the part source. Findings are not made against factories, so a factory needs no identity of its own. Factories that make no part are not kept ([D10](decisions.md#d10-model-for-the-trace-not-for-the-csv-files)).
- **Supplier, not a generic provider.** Basic Materials would add a branch below the supplier: toy, part, the supplier that makes it, then the company that supplies that supplier's material. It needs new data (companies, part-to-material, material sourcing) and is not a type value on supplier ([D7](decisions.md#d7-basic-materials-and-purchase-records-are-out-of-scope)).
- **Exposure is a query, not a table.** For a toy: take its parts, take each part's distinct suppliers, and check which of them this Finisher has a finding against ([D5](decisions.md#d5-exposure-is-computed-never-stored)). Two factories of the same supplier count as one supplier.

## Not designed yet

API, technology choices and the UI. These come next.
