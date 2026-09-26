import pytest


def _by_name(client, name):
    return next(a for a in client.get("/api/accounts").json()["accounts"] if a["name"] == name)


def test_health_does_not_expose_key(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert "key" not in str(body).lower().replace("aiconfigured", "")


def test_empty_database(client, empty_db):
    body = client.get("/api/accounts").json()
    assert body["accounts"] == []
    assert body["summary"] == {"total": 0, "high": 0, "medium": 0, "low": 0}


def test_list_accounts_sorted_by_score(client, seeded_db):
    body = client.get("/api/accounts").json()
    scores = [a["score"] for a in body["accounts"]]
    assert scores == sorted(scores, reverse=True)
    assert body["summary"]["total"] == 15
    s = body["summary"]
    assert s["high"] + s["medium"] + s["low"] == 15
    assert all(0 <= a["score"] <= 100 for a in body["accounts"])


@pytest.mark.parametrize("priority", ["HIGH", "MEDIUM", "LOW"])
def test_filter_by_priority(client, seeded_db, priority):
    body = client.get("/api/accounts", params={"priority": priority}).json()
    assert body["accounts"] and all(a["priority"] == priority for a in body["accounts"])
    assert body["summary"]["total"] == 15  # summary always covers all accounts


def test_sort_by_score_change_and_recent_activity(client, seeded_db):
    by_change = client.get("/api/accounts", params={"sort": "score_change"}).json()["accounts"]
    assert by_change[0]["name"] == "Acme Technologies"
    by_recent = client.get("/api/accounts", params={"sort": "recent_activity"}).json()["accounts"]
    assert by_recent[-1]["lastActivityAt"] is None  # no-activity account last
    stamps = [a["lastActivityAt"] for a in by_recent if a["lastActivityAt"]]
    assert stamps == sorted(stamps, reverse=True)


def test_invalid_sort_param_rejected(client, seeded_db):
    assert client.get("/api/accounts", params={"sort": "bogus"}).status_code == 422


def test_hero_account_detail(client, seeded_db):
    acme = _by_name(client, "Acme Technologies")
    detail = client.get(f"/api/accounts/{acme['id']}").json()
    assert detail["score"]["total"] == 86 and detail["score"]["priority"] == "HIGH"
    assert detail["scoreChange"] == {**detail["scoreChange"], "previous": 61, "delta": 25, "hasPrevious": True}
    assert acme["recommendedAction"]["label"] == "Contact VP Engineering"


def test_hero_intelligence(client, seeded_db):
    acme = _by_name(client, "Acme Technologies")
    intel = client.get(f"/api/accounts/{acme['id']}/intelligence").json()
    wc = intel["whatChanged"]
    assert (wc["previousScore"], wc["currentScore"], wc["delta"]) == (61, 86, 25)
    assert sum(d["points"] for d in wc["drivers"]) == 25
    labels = {d["label"] for d in wc["drivers"]}
    assert {"Pricing page visit", "VP Engineering engagement", "Technical document download", "Hiring activity"} <= labels
    assert intel["productInterest"]["product"] == "Cloud Integration"
    primary = intel["contacts"]["primaryContact"]
    assert primary["jobTitle"] == "VP Engineering" and primary["persona"] == "Technical Evaluator"
    assert intel["nextBestAction"]["action"] == "CONTACT_DECISION_MAKER"
    assert intel["nextBestAction"]["label"] == "Contact VP Engineering"
    assert len(intel["activityTrend"]) == 14


def test_score_endpoint_and_history(client, seeded_db):
    body = client.get("/api/accounts/1/score").json()
    c = body["current"]
    assert c["total"] == c["fit"] + c["intent"] + c["engagement"] + c["recency"]
    assert [comp["key"] for comp in body["components"]] == ["fit", "intent", "engagement", "recency"]
    assert len(body["history"]) >= 8
    assert body["history"][-1]["total"] == 86


def test_timeline_newest_first(client, seeded_db):
    items = client.get("/api/accounts/1/timeline").json()["items"]
    stamps = [i["timestamp"] for i in items]
    assert stamps == sorted(stamps, reverse=True)
    assert items[0]["title"] == "VP Engineering engaged with Cloud Integration product page"


def test_activities_and_contacts(client, seeded_db):
    assert len(client.get("/api/accounts/1/activities").json()) == 10
    contacts = client.get("/api/accounts/1/contacts").json()
    assert contacts["primaryContact"]["name"] == "Sarah Chen"


def test_next_action_endpoint(client, seeded_db):
    r = client.post("/api/accounts/1/next-action")
    assert r.status_code == 200 and r.json()["action"] == "CONTACT_DECISION_MAKER"


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", ""), ("get", "/activities"), ("get", "/score"), ("get", "/timeline"),
        ("get", "/contacts"), ("get", "/intelligence"), ("post", "/analyze"), ("post", "/next-action"),
    ],
)
def test_invalid_account_returns_404(client, seeded_db, method, path):
    r = getattr(client, method)(f"/api/accounts/99999{path}")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"].lower()


def test_edge_case_accounts(client, seeded_db):
    lumen = client.get(f"/api/accounts/{_by_name(client, 'Lumen Media Co')['id']}/intelligence").json()
    assert lumen["signalStatus"]["hasMeaningfulActivity"] is False
    assert lumen["nextBestAction"]["action"] == "MONITOR_ACCOUNT"
    assert lumen["productInterest"]["product"] == "Insufficient signals"

    cobalt = client.get(f"/api/accounts/{_by_name(client, 'Cobalt Security Labs')['id']}/intelligence").json()
    assert cobalt["contacts"]["message"] == "No relevant contact identified."
    assert cobalt["nextBestAction"]["target"] is None

    blue = client.get(f"/api/accounts/{_by_name(client, 'BlueRiver Logistics')['id']}/intelligence").json()
    assert blue["contacts"]["decisionMakerMessage"] == "No decision-maker persona identified."
    assert blue["nextBestAction"]["action"] != "CONTACT_DECISION_MAKER"

    nimbus_id = _by_name(client, "Nimbus Education")["id"]
    nimbus = client.get(f"/api/accounts/{nimbus_id}/intelligence").json()
    assert nimbus["score"]["dataQuality"]["futureActivities"] == 2
    assert nimbus["nextBestAction"]["action"] != "SCHEDULE_DEMO"
    timeline = client.get(f"/api/accounts/{nimbus_id}/timeline").json()["items"]
    assert sum(1 for i in timeline if i["isFuture"] and not i["countedInScore"]) == 2

    pinnacle = client.get(f"/api/accounts/{_by_name(client, 'Pinnacle Insurance')['id']}/score").json()
    assert pinnacle["current"]["recency"] == 0

    evergreen = client.get(f"/api/accounts/{_by_name(client, 'Evergreen Energy')['id']}/intelligence").json()
    assert set(evergreen["score"]["dataQuality"]["missingFields"]) == {"employeeCount", "website"}


def test_post_activity_and_duplicate_rejected(client, seeded_db):
    lumen_id = _by_name(client, "Lumen Media Co")["id"]
    payload = {"activityType": "PRICING_PAGE_VIEW", "timestamp": "2026-01-01T10:00:00Z", "metadata": {"page": "/pricing"}}
    assert client.post(f"/api/accounts/{lumen_id}/activities", json=payload).status_code == 201
    assert client.post(f"/api/accounts/{lumen_id}/activities", json=payload).status_code == 409
    bad = dict(payload, activityType="NOT_A_TYPE")
    assert client.post(f"/api/accounts/{lumen_id}/activities", json=bad).status_code == 422


def test_new_signal_updates_score_and_history(client, seeded_db):
    from app.services.time_utils import iso_utc, utcnow

    lumen_id = _by_name(client, "Lumen Media Co")["id"]
    before = client.get(f"/api/accounts/{lumen_id}/score").json()
    payload = {"activityType": "DEMO_REQUEST", "timestamp": iso_utc(utcnow()), "metadata": {"product": "Data Analytics"}}
    assert client.post(f"/api/accounts/{lumen_id}/activities", json=payload).status_code == 201
    after = client.get(f"/api/accounts/{lumen_id}/score").json()
    assert after["current"]["total"] == before["current"]["total"] + 15 + 20  # intent + recency
    assert len(after["history"]) == len(before["history"]) + 1
    assert client.post(f"/api/accounts/{lumen_id}/next-action").json()["action"] == "SCHEDULE_DEMO"
