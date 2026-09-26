from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.db import Base

ACTIVITY_TYPES = (
    "WEBSITE_VISIT",
    "PRODUCT_PAGE_VIEW",
    "PRICING_PAGE_VIEW",
    "CONTENT_DOWNLOAD",
    "EMAIL_OPEN",
    "EMAIL_CLICK",
    "DEMO_REQUEST",
    "DECISION_MAKER_ENGAGEMENT",
    "COMPANY_EXPANSION",
    "HIRING_ACTIVITY",
)


def activity_dedupe_key(activity_type: str, timestamp: datetime, metadata: dict[str, Any] | None) -> str:
    """Stable fingerprint of an activity. Two activities with the same type,
    timestamp and metadata are exact duplicates."""
    canonical = json.dumps(
        [activity_type, timestamp.replace(microsecond=0).isoformat(), metadata or {}],
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(canonical.encode()).hexdigest()[:32]


class Activity(Base):
    __tablename__ = "activities"
    # Exact duplicates cannot be stored twice for the same account.
    __table_args__ = (UniqueConstraint("account_id", "dedupe_key", name="uq_activity_dedupe"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    # `metadata` is reserved by SQLAlchemy's declarative API, so the Python
    # attribute is `metadata_` while the column is still named `metadata`.
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(64), nullable=False)

    account: Mapped["Account"] = relationship(back_populates="activities")  # noqa: F821

    def __init__(self, **kwargs: Any) -> None:
        if "metadata" in kwargs:
            kwargs["metadata_"] = kwargs.pop("metadata")
        super().__init__(**kwargs)
        if not self.dedupe_key and self.activity_type and self.timestamp:
            self.dedupe_key = activity_dedupe_key(self.activity_type, self.timestamp, self.metadata_)
