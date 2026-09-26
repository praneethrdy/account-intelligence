from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.models import Account
from app.routes.accounts import router as accounts_router

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    settings = get_settings()
    with SessionLocal() as db:
        count = db.scalar(select(func.count(Account.id)))
    log.info("Database ready (%s accounts). AI configured: %s (model %s)", count, settings.ai_configured, settings.openrouter_model)
    if count == 0:
        if os.getenv("AUTO_SEED", "").lower() in ("1", "true", "yes"):
            # Hosted demo: ephemeral disks start empty, so load fresh demo data.
            from app.seed import seed

            seed(verbose=False)
            log.info("Database was empty - loaded the demo dataset (AUTO_SEED).")
        else:
            log.info("Database is empty - run `python -m app.seed` to load the demo dataset.")
    yield


app = FastAPI(
    title="AI Account Intelligence & Next-Best-Action Engine",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    # Vercel production + preview URLs for this project (read-only demo data, no cookies).
    allow_origin_regex=r"https://account-intelligence[a-z0-9-]*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(accounts_router)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    settings = get_settings()
    # Never return the key itself - only whether one is configured.
    return {"status": "ok", "aiConfigured": settings.ai_configured, "model": settings.openrouter_model}
