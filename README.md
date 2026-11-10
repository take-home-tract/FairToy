# FairToy

Submission for the TRACT take-home test: a Finisher-facing tool to flag a supplier for child labor and trace which toys are affected.

- [Assignment](Assignment.md)
- [Original data](toy_data/)

## Docs

- [Spec](docs/spec.md): what the app must do and why
- [Design](docs/design.md): system, data model, schema, components
- [API](docs/api.md): the contract between frontend and backend
- [UX](docs/ux.md): screens and walkthrough
- [Decisions](docs/decisions.md): the choices made and what was rejected

## Running it

You need [uv](https://docs.astral.sh/uv/getting-started/installation/), which also installs the right Python for you, and [Node.js](https://nodejs.org/) 22.22 or newer.

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
