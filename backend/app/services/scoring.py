"""Deterministic account scoring engine.

Total (0-100) = Fit (0-30) + Intent (0-30) + Engagement (0-20) + Recency (0-20)

The AI never produces or changes these numbers. Every function here is pure:
given an account, its activities and an `as_of` time, it always returns the
same result. That lets us recompute "yesterday's" score exactly and attribute
score changes to individual signals.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Iterable, Protocol

from app.config import TARGET_EMPLOYEE_MAX, TARGET_EMPLOYEE_MIN, TARGET_INDUSTRIES

FIT_MAX = 30
INTENT_MAX = 30
ENGAGEMENT_MAX = 20
RECENCY_MAX = 20
TOTAL_MAX = 100

INDUSTRY_MATCH_POINTS = 15
SIZE_MATCH_POINTS = 15

# Points per signal, and how many occurrences of each type may count inside the
# signal window. The per-type cap stops repeated activity (e.g. 40 pricing page
# refreshes) from dominating the score.
INTENT_POINTS: dict[str, int] = {
    "DEMO_REQUEST": 15,
    "PRICING_PAGE_VIEW": 8,
    "PRODUCT_PAGE_VIEW": 4,
    "CONTENT_DOWNLOAD": 3,
    # Trigger events: firmographic change that signals a buying window.
    "HIRING_ACTIVITY": 5,
    "COMPANY_EXPANSION": 5,
}
INTENT_MAX_COUNT: dict[str, int] = {
    "DEMO_REQUEST": 1,
    "PRICING_PAGE_VIEW": 2,
    "PRODUCT_PAGE_VIEW": 3,
    "CONTENT_DOWNLOAD": 3,
    "HIRING_ACTIVITY": 1,
    "COMPANY_EXPANSION": 1,
}
ENGAGEMENT_POINTS: dict[str, int] = {
    "EMAIL_OPEN": 2,
    "EMAIL_CLICK": 4,
    "CONTENT_DOWNLOAD": 3,
    "DECISION_MAKER_ENGAGEMENT": 8,
    "WEBSITE_VISIT": 1,
}
ENGAGEMENT_MAX_COUNT: dict[str, int] = {
    "EMAIL_OPEN": 3,
    "EMAIL_CLICK": 2,
    "CONTENT_DOWNLOAD": 3,
    "DECISION_MAKER_ENGAGEMENT": 2,
    "WEBSITE_VISIT": 5,
}

# Intent and engagement only count signals from this rolling window.
SIGNAL_WINDOW_DAYS = 30
# Small tolerance for clock skew; anything later than this is a future
# timestamp and is excluded from scoring.
FUTURE_TOLERANCE = timedelta(minutes=5)
# Email opens are unreliable (privacy proxies, bots) so they never refresh recency.
NON_MEANINGFUL_FOR_RECENCY = {"EMAIL_OPEN"}

RECENCY_BANDS: list[tuple[timedelta, int, str]] = [
    (timedelta(hours=24), 20, "within 24 hours"),
    (timedelta(days=3), 15, "within 3 days"),
    (timedelta(days=7), 10, "within 7 days"),
    (timedelta(days=14), 5, "within 14 days"),
]

SUPPORTED_TYPES = set(INTENT_POINTS) | set(ENGAGEMENT_POINTS)


class AccountLike(Protocol):
    industry: str | None
    employee_count: int | None
    target_industry: bool | None


class ActivityLike(Protocol):
    activity_type: str
    timestamp: datetime


def activity_metadata(activity: Any) -> dict[str, Any]:
    meta = getattr(activity, "metadata_", None)
    if meta is None:
        meta = getattr(activity, "metadata", None)
    return meta if isinstance(meta, dict) else {}


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, int(value)))


def priority_for(total: int) -> str:
    total = clamp(total, 0, TOTAL_MAX)
    if total >= 80:
        return "HIGH"
    if total >= 50:
        return "MEDIUM"
    return "LOW"


@dataclass
class ComponentLine:
    activity_type: str
    occurrences: int
    counted: int
    points_each: int
    points: int


@dataclass
class ScoreResult:
    fit: int
    intent: int
    engagement: int
    recency: int
    total: int
    priority: str
    as_of: datetime
    fit_reasons: list[str] = field(default_factory=list)
    intent_lines: list[ComponentLine] = field(default_factory=list)
    engagement_lines: list[ComponentLine] = field(default_factory=list)
    recency_reason: str = ""
    latest_meaningful_at: datetime | None = None
    considered_count: int = 0
    excluded_future: int = 0
    excluded_duplicates: int = 0
    excluded_outside_window: int = 0
    excluded_unsupported: int = 0


@dataclass
class EligibleSignals:
    in_window: list[Any]
    all_past: list[Any]  # deduped, not-future (any age) - used for recency
    future: int = 0
    duplicates: int = 0
    outside_window: int = 0
    unsupported: int = 0


def _fingerprint(activity: Any) -> str:
    return json.dumps(
        [activity.activity_type, activity.timestamp.replace(microsecond=0).isoformat(), activity_metadata(activity)],
        sort_keys=True,
        default=str,
    )


def eligible_signals(activities: Iterable[Any], as_of: datetime) -> EligibleSignals:
    """Filter activities to those that may influence the score at `as_of`.

    Excludes future timestamps, exact duplicates, unsupported types and
    (for intent/engagement) signals older than the rolling window."""
    window_start = as_of - timedelta(days=SIGNAL_WINDOW_DAYS)
    seen: set[str] = set()
    result = EligibleSignals(in_window=[], all_past=[])
    for a in sorted(activities, key=lambda x: (x.timestamp, getattr(x, "id", 0) or 0)):
        if a.activity_type not in SUPPORTED_TYPES:
            result.unsupported += 1
            continue
        if a.timestamp > as_of + FUTURE_TOLERANCE:
            result.future += 1
            continue
        fp = _fingerprint(a)
        if fp in seen:
            result.duplicates += 1
            continue
        seen.add(fp)
        result.all_past.append(a)
        if a.timestamp >= window_start:
            result.in_window.append(a)
        else:
            result.outside_window += 1
    return result


def is_target_industry(account: AccountLike) -> bool:
    if account.target_industry is not None:
        return bool(account.target_industry)
    return (account.industry or "").strip() in TARGET_INDUSTRIES


def fit_score(account: AccountLike) -> tuple[int, list[str]]:
    points = 0
    reasons: list[str] = []
    if is_target_industry(account):
        points += INDUSTRY_MATCH_POINTS
        reasons.append(f"+{INDUSTRY_MATCH_POINTS} {account.industry} is a target industry")
    elif account.industry:
        reasons.append(f"+0 {account.industry} is outside the target industries")
    else:
        reasons.append("+0 Industry unknown")

    size = account.employee_count
    if size is not None and TARGET_EMPLOYEE_MIN <= size <= TARGET_EMPLOYEE_MAX:
        points += SIZE_MATCH_POINTS
        reasons.append(
            f"+{SIZE_MATCH_POINTS} {size:,} employees fits the {TARGET_EMPLOYEE_MIN:,}-{TARGET_EMPLOYEE_MAX:,} target range"
        )
    elif size is not None:
        reasons.append(
            f"+0 {size:,} employees is outside the {TARGET_EMPLOYEE_MIN:,}-{TARGET_EMPLOYEE_MAX:,} target range"
        )
    else:
        reasons.append("+0 Employee count unknown")
    return clamp(points, 0, FIT_MAX), reasons


def _capped_component(
    signals: list[Any], points_table: dict[str, int], max_count: dict[str, int], cap: int
) -> tuple[int, list[ComponentLine]]:
    counts: dict[str, int] = {}
    for a in signals:
        if a.activity_type in points_table:
            counts[a.activity_type] = counts.get(a.activity_type, 0) + 1
    lines: list[ComponentLine] = []
    raw = 0
    for activity_type, n in counts.items():
        counted = min(n, max_count.get(activity_type, n))
        pts = counted * points_table[activity_type]
        raw += pts
        lines.append(ComponentLine(activity_type, n, counted, points_table[activity_type], pts))
    lines.sort(key=lambda line: -line.points)
    return clamp(raw, 0, cap), lines


def intent_score(signals: list[Any]) -> tuple[int, list[ComponentLine]]:
    return _capped_component(signals, INTENT_POINTS, INTENT_MAX_COUNT, INTENT_MAX)


def engagement_score(signals: list[Any]) -> tuple[int, list[ComponentLine]]:
    return _capped_component(signals, ENGAGEMENT_POINTS, ENGAGEMENT_MAX_COUNT, ENGAGEMENT_MAX)


def recency_score(signals: list[Any], as_of: datetime) -> tuple[int, str, datetime | None]:
    meaningful = [a for a in signals if a.activity_type not in NON_MEANINGFUL_FOR_RECENCY]
    if not meaningful:
        return 0, "No meaningful activity detected", None
    latest = max(a.timestamp for a in meaningful)
    # Timestamps within the clock-skew tolerance are treated as "now", never
    # as better than now.
    age = max(timedelta(0), as_of - latest)
    for limit, pts, label in RECENCY_BANDS:
        if age <= limit:
            return pts, f"Most recent meaningful activity {label}", latest
    return 0, "Most recent meaningful activity is older than 14 days", latest


def calculate_score(account: AccountLike, activities: Iterable[Any], as_of: datetime) -> ScoreResult:
    elig = eligible_signals(activities, as_of)
    fit, fit_reasons = fit_score(account)
    intent, intent_lines = intent_score(elig.in_window)
    engagement, engagement_lines = engagement_score(elig.in_window)
    recency, recency_reason, latest = recency_score(elig.all_past, as_of)
    total = clamp(fit + intent + engagement + recency, 0, TOTAL_MAX)
    return ScoreResult(
        fit=fit,
        intent=intent,
        engagement=engagement,
        recency=recency,
        total=total,
        priority=priority_for(total),
        as_of=as_of,
        fit_reasons=fit_reasons,
        intent_lines=intent_lines,
        engagement_lines=engagement_lines,
        recency_reason=recency_reason,
        latest_meaningful_at=latest,
        considered_count=len(elig.in_window),
        excluded_future=elig.future,
        excluded_duplicates=elig.duplicates,
        excluded_outside_window=elig.outside_window,
        excluded_unsupported=elig.unsupported,
    )


def signal_points(activities: Iterable[Any], as_of: datetime) -> int:
    """Intent + engagement for a set of activities (used for change attribution)."""
    elig = eligible_signals(activities, as_of)
    return intent_score(elig.in_window)[0] + engagement_score(elig.in_window)[0]
