"""Where things live on disk. Both paths can be overridden by environment variables."""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

# The databases created by the seed: accounts.db and one finisher-<id>.db each.
DATA_DIR = Path(os.environ.get("FAIRTOY_DATA_DIR", BACKEND_DIR / "data"))

# The six CSV files of the assignment. Only ever read.
CSV_DIR = Path(os.environ.get("FAIRTOY_CSV_DIR", REPO_DIR / "toy_data"))

# All seeded demo users share this password (README). Stored only as a hash.
DEMO_PASSWORD = "fairtoy-demo"
