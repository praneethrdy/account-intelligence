"""'What Changed?' - explain the score delta using the actual stored activity.

Attribution method (exact, sums to the real delta):
  * fit delta           = fit(now) - fit(prev)
  * recency delta       = recency(now) - recency(prev)
  * aged-out signals    = signals(prev set, now) - signals(prev set, prev)
  * each new signal     = marginal intent+engagement points when the new
                          activities are added one by one in chronological order
  * other adjustments   = any residual vs. the stored snapshot (e.g. rule changes)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.services.personas import DECISION_MAKER_PERSONAS, persona_for_title
from app.services.scoring import (
    ENGAGEMENT_POINTS,
    FUTURE_TOLERANCE,
    INTENT_POINTS,
    ScoreResult,
    activity_metadata,
    calculate_score,
    signal_points,
)
from app.services.signals import short_label, signal_category


@dataclass
class ChangeDriver:
    label: str
    points: int
    kind: str  # signal | recency | fit | decay | other
    activity_id: int | None = None
    activity_type: str | None = None
    timestamp: datetime | None = None
    note: str | None = None


@dataclass
class WhatChanged:
    has_previous: bool
    previous_score: int | None
    current_score: int
    delta: int
    previous_at: datetime | None
    drivers: list[ChangeDriver] = field(default_factory=list)
    new_signal_count: int = 0
    zero_point_signals: int = 0
    explanation: str = ""


def _prev_total(snapshot: Any) -> int:
    return int(snapshot.total_score)


def compute_what_changed(
    account: Any, activities: list[Any], previous_snapshot: Any | None, current: ScoreResult, now: datetime
) -> WhatChanged:
    if previous_snapshot is None:
        return WhatChanged(
            has_previous=False,
            previous_score=None,
            current_score=current.total,
            delta=0,
            previous_at=None,
            explanation="No earlier score snapshot is available yet, so there is no change to compare.",
        )

    prev_at = previous_snapshot.calculated_at
    prev_total = _prev_total(previous_snapshot)
    delta = current.total - prev_total
    recomputed_prev = calculate_score(account, activities, prev_at)

    prev_set = [a for a in activities if a.timestamp <= prev_at + FUTURE_TOLERANCE]
    new_set = sorted(
        (a for a in activities if prev_at + FUTURE_TOLERANCE < a.timestamp <= now + FUTURE_TOLERANCE),
        key=lambda a: (a.timestamp, getattr(a, "id", 0) or 0),
    )

    drivers: list[ChangeDriver] = []
    zero_point = 0
    running = list(prev_set)
    base = signal_points(running, now)
    for a in new_set:
        running.append(a)
        after = signal_points(running, now)
        pts = after - base
        base = after
        if pts == 0:
            zero_point += 1
            continue
        nominal = INTENT_POINTS.get(a.activity_type, 0) + ENGAGEMENT_POINTS.get(a.activity_type, 0)
        note = f"Worth +{nominal} normally; limited by score caps" if 0 < pts < nominal else None
        drivers.append(
            ChangeDriver(
                label=short_label(a),
                points=pts,
                kind="signal",
                activity_id=getattr(a, "id", None),
                activity_type=a.activity_type,
                timestamp=a.timestamp,
                note=note,
            )
        )

    decay = signal_points(prev_set, now) - signal_points(prev_set, prev_at)
    if decay:
        drivers.append(ChangeDriver("Older signals aged out of the 30-day window", decay, "decay"))

    recency_delta = current.recency - recomputed_prev.recency
    if recency_delta:
        drivers.append(
            ChangeDriver(
                "Recency" + (" - fresh activity" if recency_delta > 0 else " - activity is getting older"),
                recency_delta,
                "recency",
                note=current.recency_reason,
            )
        )

    fit_delta = current.fit - recomputed_prev.fit
    if fit_delta:
        drivers.append(ChangeDriver("Firmographic fit changed", fit_delta, "fit"))

    residual = delta - sum(d.points for d in drivers)
    if residual:
        drivers.append(ChangeDriver("Other adjustments (scoring model or data corrections)", residual, "other"))

    drivers.sort(key=lambda d: (-abs(d.points), d.label))
    result = WhatChanged(
        has_previous=True,
        previous_score=prev_total,
        current_score=current.total,
        delta=delta,
        previous_at=prev_at,
        drivers=drivers,
        new_signal_count=len(new_set),
        zero_point_signals=zero_point,
    )
    result.explanation = _explain(result, new_set, recomputed_prev, current)
    return result


def _explain(change: WhatChanged, new_set: list[Any], prev: ScoreResult, current: ScoreResult) -> str:
    """Deterministic narrative built only from the stored signals."""
    if change.delta == 0 and not new_set:
        return "No new signals since the previous score. The account's state is unchanged."

    parts: list[str] = []
    categories = {signal_category(a.activity_type) for a in new_set}
    dm_titles = []
    for a in new_set:
        if a.activity_type == "DECISION_MAKER_ENGAGEMENT":
            title = activity_metadata(a).get("contact_title")
            if title and persona_for_title(title) in DECISION_MAKER_PERSONAS:
                dm_titles.append(f"{title} ({persona_for_title(title).lower()})")

    if change.delta >= 15:
        parts.append("The account became significantly more active")
    elif change.delta > 0:
        parts.append("The account became somewhat more active")
    elif change.delta <= -10:
        parts.append("The account has cooled noticeably")
    elif change.delta < 0:
        parts.append("The account is slightly less active")
    else:
        parts.append("New activity was recorded but did not move the score")

    detail = []
    if ("intent" in categories or "trigger" in categories) and current.intent > prev.intent:
        detail.append(f"new buying signals (intent up from {prev.intent} to {current.intent})")
    if dm_titles:
        detail.append("engagement from a relevant decision-maker, " + ", ".join(dict.fromkeys(dm_titles)))
    if "trigger" in categories:
        detail.append("a company trigger event (hiring or expansion)")
    if change.delta < 0 and current.recency < prev.recency:
        detail.append("its most recent activity getting older")
    if len(detail) > 1:
        joined = ", ".join(detail[:-1]) + " and " + detail[-1]
    else:
        joined = "".join(detail)
    sentence = parts[0] + (", with " + joined if joined else "") + "."
    if change.zero_point_signals:
        sentence += (
            f" {change.zero_point_signals} additional signal(s) added no points because"
            " their per-type or component caps were already reached."
        )
    return sentence
