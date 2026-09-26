from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.database import get_db
from app.models import Account, Activity, activity_dedupe_key
from app.schemas import (
    AccountDetail,
    AccountListItem,
    AccountListResponse,
    ActivityCreate,
    ActivityOut,
    AnalyzeResponse,
    ContactsResponse,
    DashboardSummary,
    IntelligenceResponse,
    NextActionOut,
    ScoreDetailResponse,
    TimelineResponse,
)
from app.services import ai_analyst
from app.services import intelligence as intel
from app.services.scoring import FUTURE_TOLERANCE
from app.services.time_utils import utcnow

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

_LOAD = (selectinload(Account.contacts), selectinload(Account.activities), selectinload(Account.scores))


def _get_account(db: Session, account_id: int) -> Account:
    account = db.execute(select(Account).options(*_LOAD).where(Account.id == account_id)).scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Account {account_id} not found")
    return account


def _state(db: Session, account: Account, now: datetime | None = None) -> intel.AccountState:
    now = now or utcnow()
    state = intel.compute_state(account, now)
    if intel.sync_snapshot(db, account, state.score, now):
        db.commit()
    return state


def _intelligence(db: Session, account: Account) -> IntelligenceResponse:
    state = _state(db, account)
    return IntelligenceResponse(
        account=intel.account_out(account),
        score=intel.score_detail(state),
        what_changed=intel.what_changed_out(state),
        product_interest=intel.product_out(state.product),
        contacts=intel.contacts_response(state),
        next_best_action=intel.action_out(state.action),
        activity_trend=intel.activity_trend(state),
        signal_status=intel.signal_status(state),
        ai_configured=get_settings().ai_configured,
    )


@router.get("", response_model=AccountListResponse)
def list_accounts(
    priority: Literal["ALL", "HIGH", "MEDIUM", "LOW", "all", "high", "medium", "low"] = "ALL",
    sort: Literal["score", "score_change", "recent_activity"] = "score",
    order: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
) -> AccountListResponse:
    now = utcnow()
    accounts = db.execute(select(Account).options(*_LOAD)).scalars().all()
    items: list[AccountListItem] = []
    changed = False
    for account in accounts:
        state = intel.compute_state(account, now)
        changed |= intel.sync_snapshot(db, account, state.score, now)
        latest = intel.latest_signal(state)
        items.append(
            AccountListItem(
                **intel.account_out(account).model_dump(),
                score=state.score.total,
                priority=state.score.priority,
                score_change=intel.score_change(state),
                latest_signal=latest,
                last_activity_at=intel.latest_activity_at(state),
                recommended_action=intel.action_summary(state.action),
            )
        )
    if changed:
        db.commit()

    summary = DashboardSummary(
        total=len(items),
        high=sum(i.priority == "HIGH" for i in items),
        medium=sum(i.priority == "MEDIUM" for i in items),
        low=sum(i.priority == "LOW" for i in items),
    )
    wanted = priority.upper()
    if wanted != "ALL":
        items = [i for i in items if i.priority == wanted]

    reverse = order == "desc"
    items.sort(key=lambda i: i.name.lower())  # stable alphabetical tiebreak
    if sort == "score":
        items.sort(key=lambda i: i.score, reverse=reverse)
    elif sort == "score_change":
        items.sort(key=lambda i: (i.score_change.delta, i.score), reverse=reverse)
    else:  # recent_activity: accounts without activity always last
        with_act = sorted(
            (i for i in items if i.last_activity_at), key=lambda i: i.last_activity_at, reverse=reverse
        )
        items = with_act + [i for i in items if not i.last_activity_at]
    return AccountListResponse(accounts=items, summary=summary)


@router.get("/{account_id}", response_model=AccountDetail, responses={404: {"description": "Account not found"}})
def get_account(account_id: int, db: Session = Depends(get_db)) -> AccountDetail:
    account = _get_account(db, account_id)
    state = _state(db, account)
    return AccountDetail(
        **intel.account_out(account).model_dump(),
        score=intel.breakdown(state.score),
        score_change=intel.score_change(state),
    )


@router.get("/{account_id}/activities", response_model=list[ActivityOut])
def get_activities(account_id: int, db: Session = Depends(get_db)) -> list[ActivityOut]:
    account = _get_account(db, account_id)
    now = utcnow()
    out = []
    for a in sorted(account.activities, key=lambda x: (x.timestamp, x.id), reverse=True):
        item = ActivityOut.model_validate(a)
        item.is_future = a.timestamp > now + FUTURE_TOLERANCE
        out.append(item)
    return out


@router.post(
    "/{account_id}/activities",
    response_model=ActivityOut,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Exact duplicate activity"}},
)
def create_activity(account_id: int, body: ActivityCreate, db: Session = Depends(get_db)) -> ActivityOut:
    """Ingest a new signal. Exact duplicates are rejected with 409."""
    account = _get_account(db, account_id)
    key = activity_dedupe_key(body.activity_type, body.timestamp, body.metadata)
    if any(a.dedupe_key == key for a in account.activities):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate activity already recorded")
    activity = Activity(
        account_id=account.id, activity_type=body.activity_type, timestamp=body.timestamp, metadata=body.metadata
    )
    account.activities.append(activity)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Duplicate activity already recorded")
    _state(db, account)  # record a new score snapshot
    item = ActivityOut.model_validate(activity)
    item.is_future = activity.timestamp > utcnow() + FUTURE_TOLERANCE
    return item


@router.get("/{account_id}/score", response_model=ScoreDetailResponse)
def get_score(account_id: int, db: Session = Depends(get_db)) -> ScoreDetailResponse:
    account = _get_account(db, account_id)
    return intel.score_detail(_state(db, account))


@router.get("/{account_id}/timeline", response_model=TimelineResponse)
def get_timeline(account_id: int, db: Session = Depends(get_db)) -> TimelineResponse:
    account = _get_account(db, account_id)
    return intel.timeline(account, utcnow())


@router.get("/{account_id}/contacts", response_model=ContactsResponse)
def get_contacts(account_id: int, db: Session = Depends(get_db)) -> ContactsResponse:
    account = _get_account(db, account_id)
    return intel.contacts_response(intel.compute_state(account, utcnow()))


@router.get("/{account_id}/intelligence", response_model=IntelligenceResponse)
def get_intelligence(account_id: int, db: Session = Depends(get_db)) -> IntelligenceResponse:
    return _intelligence(db, _get_account(db, account_id))


@router.post("/{account_id}/next-action", response_model=NextActionOut)
def next_action(account_id: int, db: Session = Depends(get_db)) -> NextActionOut:
    account = _get_account(db, account_id)
    return intel.action_out(_state(db, account).action)


@router.post("/{account_id}/analyze", response_model=AnalyzeResponse)
def analyze(account_id: int, db: Session = Depends(get_db)) -> AnalyzeResponse:
    """AI interpretation of the deterministic intelligence. Always returns 200
    with status "ok" or "unavailable" so the UI can fall back gracefully."""
    account = _get_account(db, account_id)
    data = _intelligence(db, account)
    return ai_analyst.analyze_account(data, intel.timeline(account, utcnow()))
