# FairToy

Submission for the TRACT take-home test: a Finisher-facing tool to flag a supplier for child labor and trace which toys are affected.

- [Assignment](Assignment.md)
- [Original data](toy_data/)

## What it does

A user signs in and sees only their own Finisher's toys, parts and suppliers. Each Finisher's data lives in its own SQLite database, so isolation does not depend on every query remembering a filter.

- **Toys:** every toy with its exposure (Affected, Possibly affected, No finding in its chain), the three counts, a filter, search, and the flagged suppliers behind each exposed toy.
- **Toy trace:** why the toy has its exposure, in one sentence, and its chain read by part or by supplier, down to the factory.
- **Suppliers:** each supplier with the parts it can make for you and the toys it reaches. Its page says what a finding would do before you flag it.
- **Flag and withdraw** a child labor finding, with a preview and Undo.
- **Resolve** a possibly affected part by recording which supplier actually made it, for example from purchase records.

"No finding in its chain" is never presented as safe.

## Docs

- [Spec](docs/spec.md): what the app must do and why
- [Design](docs/design.md): system, data model, schema, components
- [API](docs/api.md): the contract between frontend and backend
- [UX](docs/ux.md): screens and walkthrough
- [Decisions](docs/decisions.md): the choices made and what was rejected
- [State machine](docs/state-machine.md): findings, resolutions, exposure, the session and Undo as state machines

## Running it

You need [uv](https://docs.astral.sh/uv/getting-started/installation/), which also installs the right Python for you, and [Node.js](https://nodejs.org/) 22.22 or newer.

### Quick start

From the repository root:

```sh
npm start                               # set up what is missing, then start the API and the UI
```

The first run installs the UI packages, creates the databases from `toy_data`, and installs the Python packages. Then it starts the API on port 8000 and the UI on port 5173, prints where to sign in, and stops both on Ctrl+C. Later runs just start them; your findings and resolutions are kept.

```sh
npm test                                # run the backend tests and the end-to-end tests
npm run reset                           # delete the local databases and seed them again
```

The root `package.json` has no dependencies: these are small Node scripts in [scripts/](scripts/) that run the commands below.

### Running the parts separately

**1. The API.** From the `backend` folder:

```sh
uv run pytest                           # run the tests
uv run python -m app.seed               # create the databases in backend/data (once)
uv run uvicorn app.main:app --reload    # start the API on http://localhost:8000
```

**2. The UI.** In a second terminal, from the `frontend` folder:

```sh
npm install
npm run dev                             # start the UI on http://localhost:5173
```

**3. The UI tests** (optional). They drive a real browser against the real UI and API. They start their own API and UI on other ports with a temporary copy of the data, so they never touch yours and nothing needs to be running. From the `frontend` folder:

```sh
npx playwright install chromium         # download the test browser (once)
npm test                                # run the end-to-end tests
```

Open http://localhost:5173 and sign in.

### Demo users

The seed creates one user per Finisher and prints the list. The username is the Finisher's name in lower case with hyphens, for example `kestrel-play` or `moonpath-brands`. Every demo user has the password `fairtoy-demo`.

### Good to know

- The seed refuses to run twice, so recorded findings are never wiped. To start over, delete `backend/data`.
- The API documents itself at http://localhost:8000/docs.
- Sign-in tokens are signed with the secret in the `FAIRTOY_SECRET` environment variable. If it is not set, the API makes a random one at startup, so everyone is signed out when it restarts.
- Databases seeded by an earlier version are brought up to date when the API starts, without losing findings.

## Project layout

```text
backend/            Python API (FastAPI, SQLite)
  app/              auth, exposure calculator, repository, services, routers, seed
  tests/            pytest: seed, exposure rule, API, isolation, resolutions
frontend/           React UI (TypeScript, Vite, React Router, TanStack Query)
  src/              pages, components, API client
  e2e/              Playwright tests, including the walkthrough from docs/ux.md
docs/               spec, design, API, UX and decision log
scripts/            npm start / npm test / npm run reset
toy_data/           the six CSV files of the assignment, only ever read
```

## What I would do next

In rough order of value to a Finisher:

1. **History instead of deletes.** Withdrawing a finding or a resolution deletes it today. A real program needs to tell "recorded by mistake" from "cleared after remediation", with a reason, evidence and an audit trail, and to see who withdrew what. This is where the finding lifecycle (protect, recall, corrective action, verify) would attach ([spec](docs/spec.md#extension-points-not-built-now)).
2. **Purchase records feeding resolutions.** Resolutions are entered by hand. Importing purchase or delivery records would resolve most possibly affected parts automatically, through the same table.
3. **Data entry and upload.** Finishers bring their own suppliers, parts and toys. The seed's checks (broken references, a part made at another supplier's factory) would become the validation of an import, with a preview before anything is written.
4. **Acting on the result.** Halting orders from an implicated supplier and tracking the recall of affected toys, which is what the assignment says a Finisher does next. Ranking affected toys by yearly volume (`units_per_year`, dropped today) would show where to start.
5. **Roles and real authentication.** A viewer role that cannot flag, more than one user per Finisher, tokens in an HttpOnly cookie that can be revoked, and an identity provider.
6. **Schema migrations.** One database per Finisher means every change must reach every file. Today that is one `CREATE TABLE IF NOT EXISTS` at startup; the next change needs versioned migrations.
7. **Scale.** Exposure is recomputed for the whole catalog on every request and lists are returned whole. Fine for dozens of toys; with thousands, compute per page or keep a result refreshed when a finding changes ([design](docs/design.md#what-breaks-first-as-this-grows)).
8. **Basic Materials.** A branch below the supplier, once there is data linking parts to materials and materials to their sources.
9. **Unit tests for the UI's sentences.** The "why" text is covered by the end-to-end tests; small unit tests would make its edge cases cheaper to check.

