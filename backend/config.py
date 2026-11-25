"""Central configuration for IncidentLens."""
from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

DATA_DIR = PROJECT_ROOT / "data"
SCENARIOS_DIR = DATA_DIR / "scenarios"
REPLAYS_DIR = DATA_DIR / "replays"
UPLOADS_DIR = DATA_DIR / "uploads"
ARTIFACTS_DIR = PROJECT_ROOT / "artifacts"

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "perplexity/pplx-decider-flash-v1.3:free")
OPENROUTER_DECISIONS_URL = os.getenv(
    "OPENROUTER_DECISIONS_URL", "https://openrouter.ai/api/alpha/decisions"
)
DEFAULT_MODE = os.getenv("INCIDENTLENS_DEFAULT_MODE", "live")
