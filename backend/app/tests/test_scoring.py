from datetime import timedelta

import pytest

from app.seed import ACCOUNTS
from app.services.scoring import (
    calculate_score,
    engagement_score,
    fit_score,
    intent_score,
    priority_for,
    recency_score,
)
from app.tests.conftest import NOW, act, make_account

# ------------------------------------------------------------------ fit


def test_fit_full_match():
    assert fit_score(make_account(industry="Technology", employee_count=1200))[0] == 30


def test_fit_industry_only():
    assert fit_score(make_account(industry="Technology", employee_count=50))[0] == 15


def test_fit_size_only():
    assert fit_score(make_account(industry="Retail", employee_count=800))[0] == 15


def test_fit_none():
    assert fit_score(make_account(industry="Retail", employee_count=20000))[0] == 0


def test_fit_explicit_target_flag_wins():
    assert fit_score(make_account(industry="Retail", employee_count=800, target_industry=True))[0] == 30
    assert fit_score(make_account(industry="Technology", employee_count=800, target_industry=False))[0] == 15


def test_fit_size_boundaries():
    assert fit_score(make_account(industry="Retail", employee_count=200))[0] == 15
    assert fit_score(make_account(industry="Retail", employee_count=5000))[0] == 15
    assert fit_score(make_account(industry="Retail", employee_count=5001))[0] == 0


# --------------------------------------------------------------- intent


@pytest.mark.parametrize(
    "activity_type,points",
    [("DEMO_REQUEST", 15), ("PRICING_PAGE_VIEW", 8), ("PRODUCT_PAGE_VIEW", 4), ("CONTENT_DOWNLOAD", 3)],
)
def test_intent_points(activity_type, points):
    assert intent_score([act(activity_type)])[0] == points


def test_intent_capped_at_30():
    signals = [act("DEMO_REQUEST"), act("PRICING_PAGE_VIEW", timedelta(hours=2)),
               act("PRICING_PAGE_VIEW", timedelta(hours=3)), act("PRODUCT_PAGE_VIEW")]
    assert intent_score(signals)[0] == 30


def test_intent_repeated_activity_capped_per_type():
    signals = [act("PRICING_PAGE_VIEW", timedelta(minutes=i)) for i in range(1, 11)]
    points, lines = intent_score(signals)
    assert points == 16  # only 2 pricing views count
    assert lines[0].occurrences == 10 and lines[0].counted == 2


# ----------------------------------------------------------- engagement


@pytest.mark.parametrize(
    "activity_type,points",
    [("EMAIL_OPEN", 2), ("EMAIL_CLICK", 4), ("CONTENT_DOWNLOAD", 3), ("DECISION_MAKER_ENGAGEMENT", 8), ("WEBSITE_VISIT", 1)],
)
def test_engagement_points(activity_type, points):
    assert engagement_score([act(activity_type)])[0] == points


def test_engagement_capped_at_20():
    signals = [act("DECISION_MAKER_ENGAGEMENT", timedelta(hours=i)) for i in range(1, 3)]
    signals += [act("EMAIL_CLICK", timedelta(hours=i + 5)) for i in range(2)]
    assert engagement_score(signals)[0] == 20


# -------------------------------------------------------------- recency


@pytest.mark.parametrize(
    "ago,points",
    [
        (timedelta(hours=1), 20),
        (timedelta(hours=24), 20),
        (timedelta(hours=25), 15),
        (timedelta(days=3), 15),
        (timedelta(days=5), 10),
        (timedelta(days=7), 10),
        (timedelta(days=10), 5),
        (timedelta(days=14), 5),
        (timedelta(days=15), 0),
        (timedelta(days=60), 0),
    ],
)
def test_recency_bands(ago, points):
    assert recency_score([act("WEBSITE_VISIT", ago)], NOW)[0] == points


def test_recency_uses_most_recent_meaningful_activity():
    signals = [act("WEBSITE_VISIT", timedelta(days=10)), act("PRICING_PAGE_VIEW", timedelta(hours=2))]
    assert recency_score(signals, NOW)[0] == 20


def test_email_open_does_not_refresh_recency():
    signals = [act("WEBSITE_VISIT", timedelta(days=10)), act("EMAIL_OPEN", timedelta(hours=1))]
    assert recency_score(signals, NOW)[0] == 5


# ---------------------------------------------------------- total/bounds


def test_total_is_sum_of_components():
    account = make_account()
    s = calculate_score(account, [act("PRICING_PAGE_VIEW"), act("EMAIL_CLICK", timedelta(hours=2))], NOW)
    assert (s.fit, s.intent, s.engagement, s.recency) == (30, 8, 4, 20)
    assert s.total == 62 and s.priority == "MEDIUM"


def test_score_maxes_at_100():
    account = make_account()
    signals = [act(t, timedelta(minutes=i + 1)) for i, t in enumerate(
        ["DEMO_REQUEST", "PRICING_PAGE_VIEW", "PRICING_PAGE_VIEW", "PRODUCT_PAGE_VIEW", "CONTENT_DOWNLOAD",
         "DECISION_MAKER_ENGAGEMENT", "DECISION_MAKER_ENGAGEMENT", "EMAIL_CLICK", "EMAIL_CLICK"] * 20)]
    s = calculate_score(account, signals, NOW)
    assert s.total == 100
    assert 0 <= s.total <= 100


def test_score_min_is_zero():
    s = calculate_score(make_account(industry=None, employee_count=None), [], NOW)
    assert s.total == 0 and s.priority == "LOW"


@pytest.mark.parametrize("total,priority", [(100, "HIGH"), (80, "HIGH"), (79, "MEDIUM"), (50, "MEDIUM"), (49, "LOW"), (0, "LOW"), (150, "HIGH"), (-5, "LOW")])
def test_priority_thresholds(total, priority):
    assert priority_for(total) == priority


def test_hero_account_progression_61_to_86():
    spec = ACCOUNTS[0]
    assert spec["name"] == "Acme Technologies"
    account = make_account(industry=spec["industry"], employee_count=spec["employees"])
    activities = [act(a["type"], a["ago"], **(a["meta"] or {})) for a in spec["activities"]]
    assert calculate_score(account, activities, NOW - timedelta(days=1)).total == 61
    today = calculate_score(account, activities, NOW)
    assert today.total == 86 and today.priority == "HIGH"
