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

Work in progress: the backend can seed its databases and sign users in. The data endpoints and the UI follow.

You need [uv](https://docs.astral.sh/uv/getting-started/installation/), which also installs the right Python for you.

From the `backend` folder:

```sh
uv run pytest                           # run the tests
uv run python -m app.seed               # create the databases in backend/data (once)
uv run uvicorn app.main:app --reload    # start the API on http://localhost:8000
```

The seed prints one line per Finisher with its username, for example `kestrel-play`. Every demo user has the password `fairtoy-demo`. The seed refuses to run twice; to start over, delete `backend/data`.

The API documents itself at http://localhost:8000/docs.

Sign-in tokens are signed with the secret in the `FAIRTOY_SECRET` environment variable. If it is not set, the API makes a random one at startup, so everyone is signed out when it restarts.
