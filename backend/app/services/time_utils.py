"""All timestamps are stored as naive UTC datetimes (SQLite has no tz support)."""
from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def iso_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return to_naive_utc(dt).isoformat() + "Z"
