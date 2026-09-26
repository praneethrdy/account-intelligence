from datetime import timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import Account, Activity
from app.services import intelligence as intel
from app.services.product_interest import INSUFFICIENT, infer_product_interest
from app.services.recommendations import MONITOR_ACCOUNT, NO_CONTACT_MSG, NO_DECISION_MAKER_MSG
from app.services.scoring import calculate_score
from app.services.signals import describe
from app.tests.conftest import NOW, act, contact, make_account


def _state(account, activities=(), contacts=()):
    account.activities = list(activities)
    account.contacts = list(contacts)
    account.scores = []
    return intel.compute_state(account, NOW)


def test_no_activities():
    state = _state(make_account())
    assert state.score.recency == 0
    assert state.score.intent == state.score.engagement == 0
    assert state.action.action == MONITOR_ACCOUNT
    status = intel.signal_status(state)
    assert not status.has_meaningful_activity
    assert "No meaningful activity detected" in status.message
    assert "Insufficient signals" in status.message


def test_old_activity_gets_zero_recency():
    s = calculate_score(make_account(), [act("PRICING_PAGE_VIEW", timedelta(days=20))], NOW)
    assert s.recency == 0
    assert s.intent == 8  # still inside the 30-day signal window


def test_activity_older_than_window_not_scored():
    s = calculate_score(make_account(), [act("PRICING_PAGE_VIEW", timedelta(days=45))], NOW)
    assert s.intent == 0 and s.recency == 0 and s.excluded_outside_window == 1


def test_repeated_activities_capped_and_bounded():
    signals = [act("DEMO_REQUEST", timedelta(minutes=i + 1)) for i in range(200)]
    signals += [act("WEBSITE_VISIT", timedelta(minutes=i + 1), page=f"/p{i}") for i in range(200)]
    s = calculate_score(make_account(), signals, NOW)
    assert s.intent == 15  # a demo request counts once
    assert s.engagement == 5  # website visits capped at 5
    assert s.total <= 100


def test_no_contacts():
    state = _state(make_account(), [act("DEMO_REQUEST"), act("PRICING_PAGE_VIEW", timedelta(hours=2))])
    resp = intel.contacts_response(state)
    assert resp.contacts == [] and resp.primary_contact is None
    assert resp.message == NO_CONTACT_MSG
    assert state.action.target is None  # never invents a contact


def test_no_decision_maker():
    contacts = [contact("Kim Lee", "Engineering Manager"), contact("Sam Roe", "Marketing Coordinator")]
    activities = [act("PRICING_PAGE_VIEW", timedelta(hours=i + 1), page=f"/p{i}") for i in range(2)]
    activities += [act("PRODUCT_PAGE_VIEW", timedelta(hours=5)), act("EMAIL_CLICK", timedelta(hours=6))]
    state = _state(make_account(), activities, contacts)
    assert intel.contacts_response(state).decision_maker_message == NO_DECISION_MAKER_MSG
    assert state.action.action != "CONTACT_DECISION_MAKER"
    assert NO_DECISION_MAKER_MSG in state.action.notes
    assert state.action.target.name == "Kim Lee"  # best available alternative


def test_missing_optional_fields():
    account = make_account(industry=None, employee_count=None, website=None)
    activities = [act("WEBSITE_VISIT"), act("DECISION_MAKER_ENGAGEMENT", timedelta(hours=2))]  # no metadata
    state = _state(account, activities, [contact("Alex", None, None)])
    assert state.score.fit == 0
    assert state.score.total == state.score.engagement + state.score.recency
    assert intel.missing_fields(account) == ["industry", "employeeCount", "website"]
    assert describe(activities[1])[0] == "Decision-maker engaged"
    assert state.contacts[0].persona == "Other"


def test_future_activity_does_not_boost_score():
    account = make_account()
    past = [act("WEBSITE_VISIT", timedelta(days=10))]
    future = [act("DEMO_REQUEST", timedelta(days=-3)), act("PRICING_PAGE_VIEW", timedelta(hours=-5))]
    s = calculate_score(account, past + future, NOW)
    assert s.recency == 5  # based on the 10-day-old visit only
    assert s.intent == 0
    assert s.excluded_future == 2
    state = _state(account, past + future)
    assert state.action.action != "SCHEDULE_DEMO"


def test_small_clock_skew_is_tolerated_but_not_rewarded():
    s = calculate_score(make_account(), [act("PRICING_PAGE_VIEW", timedelta(minutes=-2))], NOW)
    assert s.intent == 8 and s.recency == 20 and s.excluded_future == 0


def test_duplicate_activities_counted_once():
    a = act("DECISION_MAKER_ENGAGEMENT", timedelta(hours=1), contact_title="CTO")
    dupes = [act("DECISION_MAKER_ENGAGEMENT", timedelta(hours=1), contact_title="CTO") for _ in range(4)]
    s = calculate_score(make_account(), [a, *dupes], NOW)
    assert s.engagement == 8
    assert s.excluded_duplicates == 4


def test_duplicate_activity_rejected_by_database(empty_db):
    with SessionLocal() as db:
        account = Account(name="Dup Co", industry="Technology")
        db.add(account)
        db.flush()
        ts = NOW - timedelta(hours=1)
        db.add(Activity(account_id=account.id, activity_type="PRICING_PAGE_VIEW", timestamp=ts, metadata={"page": "/pricing"}))
        db.commit()
        db.add(Activity(account_id=account.id, activity_type="PRICING_PAGE_VIEW", timestamp=ts, metadata={"page": "/pricing"}))
        with pytest.raises(IntegrityError):
            db.commit()


def test_no_product_signals():
    result = infer_product_interest([act("EMAIL_OPEN"), act("WEBSITE_VISIT", page="/about")])
    assert result.product == INSUFFICIENT


def test_product_interest_detected():
    signals = [
        act("PRODUCT_PAGE_VIEW", product="Cloud Integration"),
        act("CONTENT_DOWNLOAD", timedelta(hours=2), title="Cloud integration guide"),
        act("WEBSITE_VISIT", timedelta(hours=3), page="/docs/api-connectors"),
    ]
    result = infer_product_interest(signals)
    assert result.product == "Cloud Integration"
    assert result.evidence


def test_score_boundaries_always_enforced():
    for n in (0, 1, 5, 50, 500):
        signals = [act(t, timedelta(minutes=i + 1), n=i) for i in range(n) for t in ("DEMO_REQUEST", "DECISION_MAKER_ENGAGEMENT")]
        s = calculate_score(make_account(), signals, NOW)
        assert 0 <= s.total <= 100
        assert 0 <= s.fit <= 30 and 0 <= s.intent <= 30 and 0 <= s.engagement <= 20 and 0 <= s.recency <= 20
