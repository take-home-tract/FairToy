"""Settings. Each can be overridden by an environment variable."""

import os
from datetime import timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

# The databases created by the seed: accounts.db and one finisher-<id>.db each.
DATA_DIR = Path(os.environ.get("FAIRTOY_DATA_DIR", BACKEND_DIR / "data"))

# The six CSV files of the assignment. Only ever read.
CSV_DIR = Path(os.environ.get("FAIRTOY_CSV_DIR", REPO_DIR / "toy_data"))

# All seeded demo users share this password (README). Stored only as a hash.
DEMO_PASSWORD = "fairtoy-demo"

# The key that signs sign-in tokens. Never in the code: it comes from this
# environment variable. If it is not set, the API makes a random one at startup,
# so it still runs locally and sign-ins simply end when it restarts (D16).
SECRET_ENV_VAR = "FAIRTOY_SECRET"

TOKEN_LIFETIME = timedelta(hours=8)
