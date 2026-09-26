"""Assembles deterministic account intelligence from the individual engines."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Account, AccountScore
from app.schemas import (
    AccountOut,
    ActionSummary,
    ChangeDriverOut,
    ContactOut,
    ContactsResponse,
    DataQuality,
    NextActionOut,
    ProductInterestOut,
    ScoreBreakdown,
    ScoreChange,
    ScoreComponent,
    ScoreDetailResponse,
    ScorePoint,
    SignalRef,
    SignalStatus,
    TimelineItem,
    TimelineResponse,
    TrendPoint,
    WhatChangedOut,
)
from app.services.changes import WhatChanged, compute_what_changed
from app.services.personas import RankedContact, rank_contacts
from app.services.product_interest import ProductInterest, infer_product_interest
from app.services.recommendations import (
    NO_CONTACT_MSG,
    NO_DECISION_MAKER_MSG,
    NextBestAction,
    recommend_next_action,
)
from app.services.scoring import (
    ENGAGEMENT_MAX,
    FIT_MAX,
    FUTURE_TOLERANCE,
    INTENT_MAX,
    RECENCY_MAX,
    SIGNAL_WINDOW_DAYS,
    EligibleSignals,
    ScoreResult,
    _fingerprint,
    calculate_score,
    eligible_signals,
)
from app.services.signals import TYPE_LABELS, describe, signal_category

NO_ACTIVITY_MSG = "No meaningful activity detected. Insufficient signals to determine buying intent."
CHANGE_LOOKBACK = timedelta(hours=24)


@dataclass
class AccountState:
    account: Account
    now: datetime
    score: ScoreResult
    signals: EligibleSignals
    contacts: list[RankedContact]
    product: ProductInterest
    action: NextBestAction
    previous_snapshot: AccountScore | None


# ------------------------------------------------------------- snapshots
def previous_snapshot(account: Account, now: datetime) -> AccountScore | None:
    """Latest snapshot taken at least 24h ago ("since yesterday")."""
    cutoff = now - CHANGE_LOOKBACK
    older = [s for s in account.scores if s.calculated_at <= cutoff]
    return max(older, key=lambda s: (s.calculated_at, s.id or 0)) if older else None


def sync_snapshot(db: Session, account: Account, score: ScoreResult, now: datetime) -> bool:
    """Persist a new snapshot when the live score differs from the latest one."""
    latest = max(account.scores, key=lambda s: (s.calculated_at, s.id or 0)) if account.scores else None
    current = (score.fit, score.intent, score.engagement, score.recency, score.total)
    if latest is not None and (
        latest.fit_score,
        latest.intent_score,
        latest.engagement_score,
        latest.recency_score,
        latest.total_score,
    ) == current:
        return False
    snap = AccountScore(
        account_id=account.id,
        fit_score=score.fit,
        intent_score=score.intent,
        engagement_score=score.engagement,
        recency_score=score.recency,
        total_score=score.total,
        calculated_at=now,
    )
    account.scores.append(snap)
    db.add(snap)
    return True


# ---------------------------------------------------------------- state
def compute_state(account: Account, now: datetime) -> AccountState:
    activities = list(account.activities)
    score = calculate_score(account, activities, now)
    signals = eligible_signals(activities, now)
    contacts = rank_contacts(account.contacts, signals.in_window)
    product = infer_product_interest(signals.in_window)
    action = recommend_next_action(score, contacts, signals.in_window, product)
    return AccountState(account, now, score, signals, contacts, product, action, previous_snapshot(account, now))


def score_change(state: AccountState) -> ScoreChange:
    prev = state.previous_snapshot
    if prev is None:
        return ScoreChange(current=state.score.total, previous=None, delta=0, previous_at=None, has_previous=False)
    return ScoreChange(
        current=state.score.total,
        previous=prev.total_score,
        delta=state.score.total - prev.total_score,
        previous_at=prev.calculated_at,
        has_previous=True,
    )


def breakdown(score: ScoreResult) -> ScoreBreakdown:
    return ScoreBreakdown(
        fit=score.fit,
        intent=score.intent,
        engagement=score.engagement,
        recency=score.recency,
        total=score.total,
        priority=score.priority,
        calculated_at=score.as_of,
    )


LOW_VALUE_SIGNALS = {"WEBSITE_VISIT", "EMAIL_OPEN"}


def latest_activity_at(state: AccountState) -> datetime | None:
    return state.signals.all_past[-1].timestamp if state.signals.all_past else None


def latest_signal(state: AccountState) -> SignalRef | None:
    """Most recent buying signal in the window; falls back to the most recent activity."""
    if not state.signals.all_past:
        return None
    key = [a for a in state.signals.in_window if a.activity_type not in LOW_VALUE_SIGNALS]
    a = key[-1] if key else state.signals.all_past[-1]
    title, detail = describe(a)
    return SignalRef(id=a.id, activity_type=a.activity_type, title=title, detail=detail, timestamp=a.timestamp)


def contact_out(c: RankedContact | None) -> ContactOut | None:
    if c is None:
        return None
    return ContactOut(
        id=c.id,
        name=c.name,
        job_title=c.job_title,
        email=c.email,
        persona=c.persona,
        is_decision_maker=c.is_decision_maker,
        engaged=c.engaged,
        engagement_count=c.engagement_count,
        relevance=c.relevance,
    )


def action_out(a: NextBestAction) -> NextActionOut:
    return NextActionOut(
        action=a.action,
        label=a.label,
        explanation=a.explanation,
        reasons=a.reasons,
        target=contact_out(a.target),
        notes=a.notes,
    )


def action_summary(a: NextBestAction) -> ActionSummary:
    return ActionSummary(action=a.action, label=a.label)


def contacts_response(state: AccountState) -> ContactsResponse:
    contacts = [contact_out(c) for c in state.contacts]
    has_dm = any(c.is_decision_maker for c in state.contacts)
    return ContactsResponse(
        contacts=contacts,
        primary_contact=contacts[0] if contacts else None,
        message=None if contacts else NO_CONTACT_MSG,
        decision_maker_message=None if has_dm else NO_DECISION_MAKER_MSG,
    )


def product_out(p: ProductInterest) -> ProductInterestOut:
    return ProductInterestOut(product=p.product, confidence=p.confidence, evidence=p.evidence, scores=p.scores)


def _line_text(line) -> str:
    label = TYPE_LABELS.get(line.activity_type, line.activity_type)
    capped = f" (capped at {line.counted} of {line.occurrences})" if line.counted < line.occurrences else ""
    return f"+{line.points} {label} x{line.counted} @ {line.points_each}{capped}"


def components(score: ScoreResult) -> list[ScoreComponent]:
    def cap_note(raw: int, cap: int) -> list[str]:
        return [f"Raw {raw} capped at {cap}"] if raw > cap else []

    intent_raw = sum(line.points for line in score.intent_lines)
    eng_raw = sum(line.points for line in score.engagement_lines)
    return [
        ScoreComponent(key="fit", label="Fit", points=score.fit, max=FIT_MAX, lines=score.fit_reasons),
        ScoreComponent(
            key="intent",
            label="Intent",
            points=score.intent,
            max=INTENT_MAX,
            lines=[_line_text(line) for line in score.intent_lines] + cap_note(intent_raw, INTENT_MAX)
            or ["No intent signals in the last 30 days"],
        ),
        ScoreComponent(
            key="engagement",
            label="Engagement",
            points=score.engagement,
            max=ENGAGEMENT_MAX,
            lines=[_line_text(line) for line in score.engagement_lines] + cap_note(eng_raw, ENGAGEMENT_MAX)
            or ["No engagement signals in the last 30 days"],
        ),
        ScoreComponent(
            key="recency", label="Recency", points=score.recency, max=RECENCY_MAX, lines=[score.recency_reason]
        ),
    ]


def missing_fields(account: Account) -> list[str]:
    missing = []
    if not account.industry:
        missing.append("industry")
    if account.employee_count is None:
        missing.append("employeeCount")
    if not account.website:
        missing.append("website")
    return missing


def score_detail(state: AccountState) -> ScoreDetailResponse:
    history = [
        ScorePoint(
            calculated_at=s.calculated_at,
            total=s.total_score,
            fit=s.fit_score,
            intent=s.intent_score,
            engagement=s.engagement_score,
            recency=s.recency_score,
        )
        for s in sorted(state.account.scores, key=lambda s: (s.calculated_at, s.id or 0))
    ]
    return ScoreDetailResponse(
        account_id=state.account.id,
        current=breakdown(state.score),
        components=components(state.score),
        change=score_change(state),
        history=history,
        data_quality=DataQuality(
            future_activities=state.score.excluded_future,
            duplicate_activities=state.score.excluded_duplicates,
            outside_window=state.score.excluded_outside_window,
            missing_fields=missing_fields(state.account),
        ),
    )


def what_changed_out(state: AccountState) -> WhatChangedOut:
    wc: WhatChanged = compute_what_changed(
        state.account, list(state.account.activities), state.previous_snapshot, state.score, state.now
    )
    return WhatChangedOut(
        has_previous=wc.has_previous,
        previous_score=wc.previous_score,
        current_score=wc.current_score,
        delta=wc.delta,
        previous_at=wc.previous_at,
        drivers=[
            ChangeDriverOut(
                label=d.label,
                points=d.points,
                kind=d.kind,
                activity_id=d.activity_id,
                activity_type=d.activity_type,
                timestamp=d.timestamp,
                note=d.note,
            )
            for d in wc.drivers
        ],
        new_signal_count=wc.new_signal_count,
        zero_point_signals=wc.zero_point_signals,
        explanation=wc.explanation,
    )


def activity_trend(state: AccountState, days: int = 14) -> list[TrendPoint]:
    today = state.now.date()
    buckets = {
        (today - timedelta(days=i)).isoformat(): {"intent": 0, "engagement": 0, "trigger": 0}
        for i in range(days - 1, -1, -1)
    }
    for a in state.signals.all_past:
        key = a.timestamp.date().isoformat()
        if key in buckets:
            cat = signal_category(a.activity_type)
            if cat in buckets[key]:
                buckets[key][cat] += 1
    return [TrendPoint(date=d, **v) for d, v in buckets.items()]


def signal_status(state: AccountState) -> SignalStatus:
    has = state.score.considered_count > 0
    return SignalStatus(has_meaningful_activity=has, message=None if has else NO_ACTIVITY_MSG)


def timeline(account: Account, now: datetime) -> TimelineResponse:
    window_start = now - timedelta(days=SIGNAL_WINDOW_DAYS)
    seen: set[str] = set()
    items: list[TimelineItem] = []
    # Walk oldest-first so the first copy of a duplicate is the one counted.
    for a in sorted(account.activities, key=lambda x: (x.timestamp, x.id)):
        title, detail = describe(a)
        is_future = a.timestamp > now + FUTURE_TOLERANCE
        reason = None
        fp = _fingerprint(a)
        if is_future:
            reason = "Future timestamp - excluded from scoring"
        elif fp in seen:
            reason = "Duplicate activity - counted once"
        elif a.timestamp < window_start:
            reason = f"Older than {SIGNAL_WINDOW_DAYS} days - no longer scored"
        seen.add(fp)
        items.append(
            TimelineItem(
                id=a.id,
                activity_type=a.activity_type,
                category=signal_category(a.activity_type),
                title=title,
                detail=detail,
                timestamp=a.timestamp,
                is_future=is_future,
                counted_in_score=reason is None,
                excluded_reason=reason,
            )
        )
    items.reverse()  # newest first
    return TimelineResponse(account_id=account.id, items=items, message=None if items else NO_ACTIVITY_MSG)


def account_out(account: Account) -> AccountOut:
    return AccountOut.model_validate(account)
