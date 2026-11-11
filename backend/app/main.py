"""The API. Run from the backend folder:  uv run uvicorn app.main:app --reload"""

import logging
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app import config
from app.db import accounts_db_path, upgrade_databases
from app.errors import install_error_handlers
from app.routers import auth, findings, resolutions, suppliers, toys

log = logging.getLogger("fairtoy")


def _secret_from_environment() -> str:
    secret = os.environ.get(config.SECRET_ENV_VAR)
    if secret:
        return secret
    log.warning(
        "%s is not set: using a random signing secret. Everyone is signed out when the API restarts.",
        config.SECRET_ENV_VAR,
    )
    return secrets.token_urlsafe(32)


def create_app(data_dir: Path | None = None, secret: str | None = None) -> FastAPI:
    """Build the app. Tests pass their own data folder and secret."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if not accounts_db_path(app.state.data_dir).is_file():
            raise RuntimeError(
                f"No databases in {app.state.data_dir}. Run the seed first: uv run python -m app.seed"
            )
        upgrade_databases(app.state.data_dir)
        yield

    app = FastAPI(title="FairToy API", lifespan=lifespan)
    app.state.data_dir = data_dir or config.DATA_DIR
    app.state.secret = secret or _secret_from_environment()
    install_error_handlers(app)
    for module in (auth, toys, suppliers, findings, resolutions):
        app.include_router(module.router)
    return app


app = create_app()
