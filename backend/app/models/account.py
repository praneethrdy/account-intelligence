from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.db import Base
from app.services.time_utils import utcnow


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    employee_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # True when the account's industry is in the ICP target list. Nullable:
    # when unknown, the scoring engine derives it from the ICP config.
    target_industry: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    contacts: Mapped[list["Contact"]] = relationship(  # noqa: F821
        back_populates="account", cascade="all, delete-orphan"
    )
    activities: Mapped[list["Activity"]] = relationship(  # noqa: F821
        back_populates="account", cascade="all, delete-orphan"
    )
    scores: Mapped[list["AccountScore"]] = relationship(  # noqa: F821
        back_populates="account",
        cascade="all, delete-orphan",
        order_by="AccountScore.calculated_at",
    )
