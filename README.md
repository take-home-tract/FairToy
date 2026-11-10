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

Work in progress: the backend seed is the first working slice. The API and the UI follow.

You need [uv](https://docs.astral.sh/uv/), which also installs the right Python for you.

Then, from the `backend` folder:

```powershell
uv run pytest               # run the tests
uv run python -m app.seed   # create the databases in backend/data
```

The seed prints one line per Finisher with its username. Every demo user has the password `fairtoy-demo`. The seed refuses to run twice; to start over, delete `backend/data`.
