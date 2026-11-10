# Decisions

A short log of the choices that shape FairToy. Each entry says what we decided, what we rejected, and what follows. The rules themselves live in [spec.md](spec.md); the structure lives in [design.md](design.md).

## D1: One Finisher's viewpoint

- **Decision:** The app shows one Finisher looking at its own products. With no login, the user selects which Finisher they are.
- **Rejected:** A cross-Finisher view. The assignment is about a Finisher understanding its own product line.
- **Consequence:** Other Finishers' toy lines never appear.

## D2: Findings belong to the Finisher; reference data is shared

- **Decision:** Toys and findings belong to one Finisher. A finding by one Finisher never changes another's view. Parts and suppliers are shared, read-only reference data, and a Finisher's world is what its toys reach. The assignment has the Finisher flag its own supplier.
- **Rejected:** Global findings shared by all Finishers, and a private copy of every part and supplier per Finisher. The copy protects nothing: nobody edits reference data and it holds nothing private. The sample export shares suppliers and parts across Finishers, and each Finisher reaches 49 of the 50 suppliers, so private copies would mean splitting and copying the export about eight times.
- **Consequence:** A toy ID listed by two Finishers is two separate toys. Only the toy and the finding carry the Finisher.

## D3: Possible sources are only possible

- **Decision:** The data does not say which source made a part. Exposure therefore has two levels, *Affected* and *Possibly affected*, plus a third outcome, *No finding in its chain*.
- **Rejected:** A single "affected" status, which would over-report (a recall is expensive) and hide the difference between certain and possible.
- **Consequence:** Resolving *Possibly affected* needs purchase records, which are an extension point. "No finding" is never called "safe".

## D4: A finding can be recorded and withdrawn, with no history

- **Decision:** A finding can be removed so a mistaken click can be undone. No reason, status or history is kept.
- **Rejected:** No undo (every test of exposure would be irreversible), and a full lifecycle (remediation, recall, audit trail), which is out of scope.
- **Consequence:** A finding is its own record, not a true/false on the supplier. Withdrawing is where the lifecycle will attach.

## D5: Exposure is computed, never stored

- **Decision:** Exposure is derived from the current findings every time it is read.
- **Rejected:** Storing a status on each toy, which can go stale.
- **Consequence:** Recording or withdrawing a finding needs no recalculation job.

## D6: Data is assumed already loaded

- **Decision:** We assume the data is already loaded and available. The task asks for seeing toys, flagging a supplier and seeing affected toys, not for data entry. Entering or uploading data is an extension point. The six CSVs are the dataset we assume is in place.
- **Rejected:** Building upload, forms or an import pipeline, and designing how data gets in.
- **Consequence:** The design starts from a database that already holds the data. Data entry appears only as a future arrow.

## D7: Basic Materials and purchase records are out of scope

- **Decision:** The brief names Basic Materials as providers, but the data has no companies and no supplier-to-material or part-to-material link, so there is no traceability. Purchase records, which would resolve *Possibly affected*, are also absent.
- **Rejected:** Inventing data or relationships.
- **Consequence:** The model has suppliers only. Basic Materials would add a branch below the supplier later (the company that supplies the supplier's material), with its own data, not a type value on supplier. Purchase records could feed the app from a separate system.

## D8: Name it a child labor finding, not a flag

- **Decision:** The domain term is **child labor finding**. "Flag" is only UI wording, because "flag" could mean anything. A supplier with a finding is an **implicated supplier**.
- **Also:** We use the assignment's words (Finisher, Supplier, Toy, Part, Factory). **Provider** covers Suppliers and Basic Materials together and is used only for the chain and extension points; elsewhere we say Supplier. File names are not entity names: `parts.csv` holds Parts and Part sources.
- **Consequence:** Code, API and docs use these terms.

## D9: Drop data the trace does not need

- **Decision:** Keep what is needed to trace (ids and links) and to recognize things on screen (names, country).
- **Left out:**

| Left out | Why |
|---|---|
| Retail price, units per year | Commercial values; exposure does not depend on them. |
| Unit cost of a part source | Same. |
| BOM quantity | A toy is exposed if it uses the part at all, however many. |
| Factory address and city | Do not affect the trace; six are blank. |
| Factory as its own record, and factories that make no part (46 of 232) | Findings are not made against factories. Code, name and country are kept as a detail of the part source. |
| Finisher HQ country | Not needed. |
| Retailers, Basic Materials, orders, purchases | Not in the data, or out of scope. |

- **Consequence:** The blank-address problem disappears.

## D10: Model for the trace, not for the CSV files

- **Decision:** The data model is shaped around the questions we answer (toys, their parts, who can make each part, which suppliers have a finding), not copied one to one from the six CSVs. An entity exists only if it needs an identity. Toy, part, supplier and finding do. Factory does not: it is three plain fields on the part source (code, name, country). The BOM and `parts.csv` become two link tables.
- **Rejected:** Mirroring the CSVs, which brings composite keys, a factory table nobody queries, and a generic provider type with one value.
- **Consequence:** The trace is two hops (toy, part, supplier). The model has fewer concepts, and nothing in it exists "just in case".

## D11: The API is scoped to a Finisher, and findings are an idempotent sub-resource

- **Decision:** Every path is under `/api/finishers/{fid}/...`. A finding is recorded with `PUT` and withdrawn with `DELETE` on `.../suppliers/{id}/finding`. Both are idempotent and return the new finding state and toy totals. A Finisher cannot record a finding on a supplier its toys do not reach.
- **Rejected:** A Finisher header or session (there is no login), and a `POST` that creates findings with their own ids (a finding is identified by Finisher and supplier, so a repeat click would create an error or a duplicate).
- **Consequence:** A double click is harmless, isolation is enforced by the path, and the UI needs no extra call after a change. See [api.md](api.md).

## D12: Exposure is calculated in the backend by a pure function

- **Decision:** One query loads a Finisher's facts (toys, their parts, each part's suppliers, its findings). A pure function applies the spec's rule. The same function, given one extra supplier, produces the preview.
- **Rejected:** Putting the rule in SQL (harder to test, and the preview becomes a second query), and calculating in the browser (the rule would live in two places).
- **Consequence:** The rule is in exactly one place and unit-testable. It is read-time work on a few thousand rows, fine now. If it becomes slow, the calculator stays and only the fetching changes.

## D13: Show the consequence before flagging, and make undo easy

- **Decision:** The flag dialog says how many toys would become Affected or Possibly affected. After a flag, a message offers Undo. The supplier detail view lists the toys a supplier reaches.
- **Rejected:** A bare confirm dialog, and no undo until the user finds Withdraw.
- **Consequence:** The user sees the effect before it happens. The cost is one endpoint field (`exposureIfFlagged`). If time runs short this is cut first ([ux.md](ux.md)).

## D14: Stack: FastAPI, SQLite, React with TypeScript

- **Decision:** FastAPI for the API, SQLite for storage, React with TypeScript and Vite for the UI.
- **Rejected:** PostgreSQL in Docker (more to install for a few thousand rows and one writer, and a container needed just to run it).
- **Consequence:** Runs with a Python environment and Node. SQLite would be replaced if there were several writers.

## D15: Two screens plus a trace, with exposure never shown as safe

- **Decision:** Toys and Suppliers are the two screens. A toy opens a trace with its exposed parts first and the rest collapsed. The Finisher is in the top bar and in the URL. "No finding in its chain" is neutral grey. Every status has a word, a symbol and a color.
- **Rejected:** A dashboard of charts (the answer is three counts and a list), and green for "no finding" (it reads as safe).
- **Consequence:** The UI follows the user's jobs in [ux.md](ux.md).

