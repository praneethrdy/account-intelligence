from datetime import timedelta

from app.services import intelligence as intel
from app.services.recommendations import (
    CONTACT_DECISION_MAKER,
    MONITOR_ACCOUNT,
    NURTURE_ACCOUNT,
    SCHEDULE_DEMO,
    SEND_PERSONALIZED_EMAIL,
)
from app.tests.conftest import NOW, act, contact, make_account

TEAM = [
    contact("Sarah Chen", "VP Engineering", "sarah@x.com", id=1),
    contact("Marcus Reed", "Engineering Manager", "marcus@x.com", id=2),
    contact("Priya Nair", "CFO", "priya@x.com", id=3),
]


def _state(activities, contacts=TEAM, **account_kw):
    account = make_account(**account_kw)
    account.activities = activities
    account.contacts = list(contacts)
    account.scores = []
    return intel.compute_state(account, NOW)


def test_high_intent_with_decision_maker_contacts_decision_maker():
    state = _state([
        act("PRICING_PAGE_VIEW", timedelta(hours=1)),
        act("PRODUCT_PAGE_VIEW", timedelta(hours=2)),
        act("CONTENT_DOWNLOAD", timedelta(hours=3)),
        act("DECISION_MAKER_ENGAGEMENT", timedelta(hours=4), contact_email="sarah@x.com", contact_title="VP Engineering"),
        act("EMAIL_CLICK", timedelta(hours=5)),
    ])
    assert state.score.priority == "HIGH" and state.score.intent >= 15
    assert state.action.action == CONTACT_DECISION_MAKER
    assert state.action.label == "Contact VP Engineering"
    assert state.action.target.name == "Sarah Chen"


def test_engaged_decision_maker_preferred():
    state = _state([
        act("PRICING_PAGE_VIEW", timedelta(hours=1)),
        act("PRICING_PAGE_VIEW", timedelta(hours=2)),
        act("DECISION_MAKER_ENGAGEMENT", timedelta(hours=4), contact_email="priya@x.com", contact_title="CFO"),
    ])
    assert state.action.target.name == "Priya Nair"


def test_demo_request_schedules_demo():
    state = _state([act("DEMO_REQUEST", timedelta(hours=2), contact_email="marcus@x.com")])
    assert state.action.action == SCHEDULE_DEMO
    assert state.action.target.name == "Marcus Reed"  # the actual requester


def test_low_intent_nurtures():
    state = _state(
        [act("EMAIL_OPEN", timedelta(days=9)), act("WEBSITE_VISIT", timedelta(days=10))],
        industry="Retail", employee_count=50,
    )
    assert state.score.priority == "LOW"
    assert state.action.action == NURTURE_ACCOUNT


def test_medium_moderate_engagement_sends_email():
    state = _state([
        act("EMAIL_CLICK", timedelta(days=2)),
        act("PRODUCT_PAGE_VIEW", timedelta(days=2, hours=1)),
        act("EMAIL_OPEN", timedelta(days=3)),
    ])
    assert state.score.priority == "MEDIUM"
    assert state.action.action == SEND_PERSONALIZED_EMAIL


def test_no_decision_maker_uses_alternative_action():
    state = _state(
        [act("PRICING_PAGE_VIEW", timedelta(hours=1)), act("PRICING_PAGE_VIEW", timedelta(hours=2)),
         act("PRODUCT_PAGE_VIEW", timedelta(hours=3))],
        contacts=[contact("Marcus Reed", "Engineering Manager", "marcus@x.com")],
    )
    assert state.action.action == SEND_PERSONALIZED_EMAIL
    assert "No decision-maker persona identified." in state.action.notes


def test_insufficient_activity_monitors():
    assert _state([]).action.action == MONITOR_ACCOUNT
    single = _state([act("EMAIL_OPEN", timedelta(days=5))], industry="Retail", employee_count=50)
    assert single.action.action == MONITOR_ACCOUNT
