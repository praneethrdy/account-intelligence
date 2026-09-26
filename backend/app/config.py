"""Application configuration.

Secrets are read from environment variables (optionally via a `.env` file in the
project root or in `backend/`). Nothing in this module is ever sent to the
frontend.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent

# Project-root .env first, then backend/.env (does not override real env vars).
load_dotenv(PROJECT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    database_url: str
    openrouter_api_key: str | None
    openrouter_model: str
    openrouter_base_url: str
    openrouter_timeout_seconds: float
    cors_origins: list[str]

    @property
    def ai_configured(self) -> bool:
        key = (self.openrouter_api_key or "").strip()
        return bool(key) and key != "your_key_here"


def get_settings() -> Settings:
    # Read on every call so tests / reloads can change the environment.
    default_db = f"sqlite:///{(BACKEND_DIR / 'account_intel.db').as_posix()}"
    return Settings(
        database_url=os.getenv("DATABASE_URL", default_db),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY"),
        openrouter_model=os.getenv("OPENROUTER_MODEL", "openrouter/free") or "openrouter/free",
        openrouter_base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        openrouter_timeout_seconds=float(os.getenv("OPENROUTER_TIMEOUT_SECONDS", "45")),
        cors_origins=[
            o.strip()
            for o in os.getenv(
                "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
            ).split(",")
            if o.strip()
        ],
    )


# ---------------------------------------------------------------------------
# Ideal Customer Profile (ICP) used by the Fit score.
# ---------------------------------------------------------------------------
TARGET_INDUSTRIES = {"Technology", "Financial Services", "Healthcare", "Manufacturing"}
TARGET_EMPLOYEE_MIN = 200
TARGET_EMPLOYEE_MAX = 5000
