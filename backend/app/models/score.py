from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.db import Base
from app.services.time_utils import utcnow


class AccountScore(Base):
    """A point-in-time snapshot of an account's deterministic score.

    Snapshots form the score history used for "What Changed?" and charts."""

    __tablename__ = "account_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    fit_score: Mapped[int] = mapped_column(Integer, nullable=False)
    intent_score: Mapped[int] = mapped_column(Integer, nullable=False)
    engagement_score: Mapped[int] = mapped_column(Integer, nullable=False)
    recency_score: Mapped[int] = mapped_column(Integer, nullable=False)
    total_score: Mapped[int] = mapped_column(Integer, nullable=False)
    calculated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True, nullable=False)

    account: Mapped["Account"] = relationship(back_populates="scores")  # noqa: F821
