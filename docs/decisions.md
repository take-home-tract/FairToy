# Decisions

A short log of the choices that shape FairToy. Each entry says what we decided, what we rejected, and what follows. The rules themselves live in [spec.md](spec.md); the structure lives in [design.md](design.md).

## D1: One Finisher's viewpoint

- **Decision:** The app shows one Finisher's products: the Finisher of the signed-in user.
- **Rejected:** A cross-Finisher view. The assignment is about a Finisher understanding its own product line.
- **Consequence:** Other Finishers' toy lines never appear. There is no way to switch Finisher other than signing in as another user.

## D2: All of a Finisher's data belongs to it

- **Decision:** Toys, parts, suppliers and findings each belong to exactly one Finisher. Nothing is shared between Finishers. The assignment says Finishers input *their* suppliers, parts and toys, and that a user must only see and act on their Finisher's data.
- **Rejected:** One shared list of parts and suppliers with only findings kept private. It looks cheaper, but it is wrong for a multi-tenant product: a supplier list is the Finisher's own commercial data, a shared row would let one Finisher's future edit change another's view, and isolation would depend on remembering a "reached by my toys" filter in every query instead of on ownership. Also rejected: findings shared by all Finishers.
- **Consequence:** Each Finisher's toys, parts, suppliers and findings live in that Finisher's own database ([D17](#d17-isolation-is-structural-one-database-per-finisher)). The sample export combines all Finishers, so the seed gives each Finisher its own parts and suppliers (the ones its toys use). The same real-world supplier exists once per Finisher, and a toy code listed by two Finishers is two separate toys.

## D3: Possible sources are only possible

- **Decision:** The data does not say which source made a part. Exposure therefore has two levels, *Affected* and *Possibly affected*, plus a third outcome, *No finding in its chain*.
- **Rejected:** A single "affected" status, which would over-report (a recall is expensive) and hide the difference between certain and possible.
- **Consequence:** Resolving *Possibly affected* needs purchase records, which are an extension point. "No finding" is never called "safe".

## D4: A finding can be recorded and withdrawn, with no history

- **Decision:** A finding can be removed so a mistaken click can be undone. It records who made it and when. No reason, status or history is kept. Any user of the same Finisher can withdraw it.
- **Rejected:** No undo (every test of exposure would be irreversible), and a full lifecycle (remediation, recall, audit trail), which is out of scope.
- **Consequence:** A finding is its own record, not a true/false on the supplier. Withdrawing is where the lifecycle will attach.

## D5: Exposure is computed, never stored

- **Decision:** Exposure is derived from the current findings every time it is read.
- **Rejected:** Storing a status on each toy, which can go stale.
- **Consequence:** Recording or withdrawing a finding needs no recalculation job.

## D6: Data is seeded, not entered

- **Decision:** A seed step loads the six CSVs into the model and creates the users (at least one per Finisher in `finishers.csv`, as the assignment asks). It is part of the deliverable. Entering or uploading data through the app is an extension point: the task asks for seeing toys, flagging a supplier and seeing affected toys, not for data entry.
- **Rejected:** Upload screens, forms or a general import pipeline.
- **Consequence:** The app starts from a seeded database. The seed applies the model's rules once (see [design.md](design.md)), and data entry appears only as a future arrow.

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

## D11: The API is scoped by the signed-in user, and findings are an idempotent sub-resource

- **Decision:** No path or parameter names a Finisher. Every data request takes the Finisher from the signed-in user. A finding is recorded with `PUT` and withdrawn with `DELETE` on `/api/suppliers/{id}/finding`. Both are idempotent and return the new finding state. Another Finisher's supplier answers 404, like one that does not exist.
- **Rejected:** A Finisher id in the path or a header (a user could change it to another Finisher's, so every endpoint would need its own check), and a `POST` that creates findings with their own ids (a finding is identified by Finisher and supplier, so a repeat click would create an error or a duplicate).
- **Consequence:** There is nothing to tamper with: the only Finisher a request can touch is the user's own. A double click is harmless. After a change the UI refetches what it shows, so the server stays the only source of truth. See [api.md](api.md).

## D12: Exposure is calculated in the backend by a pure function

- **Decision:** One query loads a Finisher's facts (toys, their parts, each part's suppliers, its findings). A pure function applies the spec's rule. The same function, given one extra supplier, produces the preview.
- **Rejected:** Putting the rule in SQL (harder to test, and the preview becomes a second query), and calculating in the browser (the rule would live in two places).
- **Consequence:** The rule is in exactly one place and unit-testable. It is read-time work on a few thousand rows, fine now. If it becomes slow, the calculator stays and only the fetching changes.

## D13: Show the consequence before flagging, and make undo easy

- **Decision:** The flag dialog says how many toys would become Affected or Possibly affected. After a flag, a message offers Undo. The supplier detail view lists the toys a supplier reaches.
- **Rejected:** A bare confirm dialog, and no undo until the user finds Withdraw.
- **Consequence:** The user sees the effect before it happens. The cost is one endpoint field (`exposureIfFlagged`). If time runs short this is cut first ([ux.md](ux.md)).

## D14: Stack: FastAPI, SQLite, React with TypeScript

- **Decision:** FastAPI for the API, SQLite for storage (one file per Finisher, [D17](#d17-isolation-is-structural-one-database-per-finisher)), React with TypeScript and Vite for the UI.
- **Rejected:** PostgreSQL in Docker (more to install for a few thousand rows and one writer, and a container needed just to run it).
- **Consequence:** Runs with a Python environment and Node. SQLite allows one writer per file, which is now one writer per Finisher. It would be replaced if a single Finisher had many people writing at once.

## D15: Two screens plus a trace, with exposure never shown as safe

- **Decision:** Toys and Suppliers are the two screens. A toy opens a trace with its exposed parts first and the rest collapsed. The Finisher and the user are shown in the top bar. "No finding in its chain" is neutral grey. Every status has a word, a symbol and a color.
- **Rejected:** A dashboard of charts (the answer is three counts and a list), and green for "no finding" (it reads as safe).
- **Consequence:** The UI follows the user's jobs in [ux.md](ux.md).

## D16: Authentication: seeded users and a signed token

- **Decision:** Each user belongs to one Finisher. Users are seeded, at least one per Finisher from `finishers.csv`, with a demo password stored only as a hash. Passwords are stored as a salted scrypt hash (Python standard library). `POST /api/auth/login` checks the credentials and returns a signed token (JWT, HS256) that carries the user id and expires after 8 hours. The signing secret comes from configuration (an environment variable), never from the code. If it is not set, the API creates a random secret at startup and says so in the log, so the app still runs locally and sign-ins simply end when it restarts. The browser keeps the token in session storage, so it survives a refresh and is gone when the tab closes, and sends it as a bearer header. One backend dependency turns the token into the current user and their Finisher, and opens that Finisher's database for the request ([D17](#d17-isolation-is-structural-one-database-per-finisher)).
- **Rejected:** A Finisher picker with no login (the updated assignment requires authentication), server-side sessions (a session table for no gain at this size), a cookie (needs cross-site request protection, which is more to explain), and sign up, password reset, roles or third-party providers (explicitly not required).
- **Consequence:** Isolation is enforced in one place and tested directly. Another Finisher's toy is not in the database the request opened, so it answers 404 like any toy that does not exist, and nothing leaks. Tokens cannot be revoked before they expire, which is acceptable here. A token in browser storage could be read by a script injected into the page; React escapes what it renders and the app loads no third-party scripts, and an HttpOnly cookie would be the hardening step. See [api.md](api.md).

## D17: Isolation is structural: one database per Finisher

- **Decision:** Each Finisher has its own SQLite database file holding its toys, parts, suppliers and findings. A small accounts database holds the Finishers and their users. The auth component maps the signed-in user to their Finisher and gives the request a connection to that Finisher's database only. No table in a Finisher database has a Finisher column, and no service or query takes a Finisher id.
- **Rejected:** One database with a Finisher id on every row and a filter in every query (one forgotten filter leaks everything, and discipline is easy to bypass). The same with composite keys that include the Finisher (a row can no longer link to another Finisher's record, but a read without the filter still returns everyone's rows). PostgreSQL row-level security (also structural, but it needs a database server, against [D14](#d14-stack-fastapi-sqlite-react-with-typescript)).
- **Consequence:** A query cannot return or change another Finisher's data, because that data is not in the file it runs against. The risk moves to one place: the function that picks the database for a user, which is small and tested directly. The file name is built from the Finisher's numeric id in the accounts database, never from the request. Costs: a schema change must be applied to every file, there is no query across Finishers, and a finding stores the username of who recorded it as text because users live in the other database. Internal ids repeat across Finishers (toy 5 exists in each), which is harmless: the same URL shows each user their own toy.

## D18: Plain sqlite3, uv, and a seed command

- **Decision:** The backend talks to SQLite with Python's built-in `sqlite3` module and hand-written SQL. The project and its Python version are managed by uv. Tests use pytest and run the seed on the real sample data in a temporary folder. The seed is a command (`python -m app.seed`), not something the API does at startup.
- **Rejected:** An ORM such as SQLAlchemy (there are six small tables, a handful of queries and two writes, and one database file per Finisher means managing one engine per file for no gain). Seeding automatically on first start (a missing database would be recreated silently, which could hide a wrong path and look like a Finisher with no data).
- **Consequence:** Every query is visible as SQL in one module. Connections are opened in one function, which sets the foreign-key pragma and refuses to create a missing file. Someone running the app needs uv and, for the UI, Node.

## D19: Frontend libraries: React Router, TanStack Query, plain CSS

- **Decision:** React Router gives each screen its own URL and keeps the toy filter in the address. TanStack Query fetches and caches server data and refetches it after a change. Styling is one plain CSS file with variables for the status colors. The Vite dev server passes `/api` on to the Python API, so the browser sees one origin.
- **Rejected:** A global state store (there is no client state worth one: the server is the source of truth). A component or CSS framework (three screens and one badge do not need it, and it is more to install and explain). Calling the API on another origin with CORS (more configuration for no gain locally).
- **Consequence:** Four runtime dependencies. Signing in or out empties the query cache, so nothing loaded for one user can be shown to the next.

## D20: The UI is tested end to end in a real browser

- **Decision:** The frontend tests are Playwright tests that sign in and use the app in a real browser, against the real API seeded with the sample data. They start their own API and UI on separate ports with a temporary data folder. Each test begins by withdrawing all findings.
- **Rejected:** Component tests with a faked API as the main safety net. The UI holds almost no rules of its own (the exposure rule and isolation live in the backend and are tested there), so what can break is the wiring: sign-in, the token, the URLs, and what the screen shows for real data. A fake API would not catch that.
- **Consequence:** One command checks the whole stack the way a user meets it, including the numbers in [ux.md](ux.md). The cost is a browser download and a slower run than unit tests, and the tests run one at a time because they share one API.
