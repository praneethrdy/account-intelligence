import json

import httpx
import pytest

from app.services import ai_analyst
from app.services.ai_analyst import AIServiceError, parse_analysis

VALID = {
    "summary": "Acme is highly engaged.",
    "whyImportant": "Intent rose from 0 to 16.",
    "likelyNeed": "Cloud Integration.",
    "recommendedPersona": "Technical Evaluator (Sarah Chen, VP Engineering)",
    "nextBestAction": "Contact VP Engineering",
    "reasonForAction": "She engaged with the product page.",
    "personalizedMessage": "Hi Sarah, ...",
}


def _completion(content):
    return {"model": "test/model", "choices": [{"message": {"content": content}}]}


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")


# ------------------------------------------------------------- parsing


def test_parse_valid_json():
    assert parse_analysis(json.dumps(VALID)).summary == "Acme is highly engaged."


def test_parse_code_fenced_json_with_prose():
    text = "Here you go:\n```json\n" + json.dumps(VALID) + "\n```"
    assert parse_analysis(text).next_best_action == "Contact VP Engineering"


def test_parse_snake_case_keys():
    snake = {"summary": "s", "why_important": "w", "next_best_action": "n", "personalized_message": "p"}
    result = parse_analysis(json.dumps(snake))
    assert result.why_important == "w"
    assert result.likely_need.startswith("Insufficient evidence")  # missing optional field


@pytest.mark.parametrize("bad", ["not json at all", "{broken: json", "[1, 2, 3]", "", '{"summary": "only"}'])
def test_parse_malformed_raises(bad):
    with pytest.raises(AIServiceError):
        parse_analysis(bad)


# ------------------------------------------------------- API fallbacks


def test_missing_api_key_falls_back(client, seeded_db):
    r = client.post("/api/accounts/1/analyze")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "unavailable"
    assert body["errorCode"] == "missing_api_key"
    assert "AI analysis is currently unavailable" in body["message"]
    assert body["deterministicNextAction"]["label"] == "Contact VP Engineering"


@pytest.mark.parametrize(
    "error_code", ["timeout", "rate_limited", "provider_error", "auth_error", "network_error"]
)
def test_provider_failures_fall_back(client, seeded_db, with_key, monkeypatch, error_code):
    def boom(*_a, **_kw):
        raise AIServiceError(error_code, "boom")

    monkeypatch.setattr(ai_analyst, "_post_chat_completion", boom)
    body = client.post("/api/accounts/1/analyze").json()
    assert body["status"] == "unavailable" and body["errorCode"] == error_code
    assert body["deterministicNextAction"]["action"] == "CONTACT_DECISION_MAKER"
    # Deterministic intelligence keeps working after an AI failure.
    assert client.get("/api/accounts/1/intelligence").json()["score"]["current"]["total"] == 86


def test_malformed_model_output_falls_back(client, seeded_db, with_key, monkeypatch):
    monkeypatch.setattr(ai_analyst, "_post_chat_completion", lambda *_: _completion("Sure! The account is great."))
    monkeypatch.setattr(ai_analyst.time, "sleep", lambda *_: None)
    body = client.post("/api/accounts/1/analyze").json()
    assert body["status"] == "unavailable" and body["errorCode"] == "malformed_json"


def test_empty_model_output_falls_back(client, seeded_db, with_key, monkeypatch):
    monkeypatch.setattr(ai_analyst, "_post_chat_completion", lambda *_: _completion(None))
    monkeypatch.setattr(ai_analyst.time, "sleep", lambda *_: None)
    assert client.post("/api/accounts/1/analyze").json()["errorCode"] == "empty_response"


def test_unexpected_response_shape_falls_back(client, seeded_db, with_key, monkeypatch):
    monkeypatch.setattr(ai_analyst, "_post_chat_completion", lambda *_: {"weird": True})
    monkeypatch.setattr(ai_analyst.time, "sleep", lambda *_: None)
    assert client.post("/api/accounts/1/analyze").json()["status"] == "unavailable"


def test_successful_analysis(client, seeded_db, with_key, monkeypatch):
    captured = {}

    def fake(settings, messages):
        captured["messages"] = messages
        return _completion(json.dumps(VALID))

    monkeypatch.setattr(ai_analyst, "_post_chat_completion", fake)
    body = client.post("/api/accounts/1/analyze").json()
    assert body["status"] == "ok"
    assert body["analysis"]["personalizedMessage"] == "Hi Sarah, ..."
    payload = json.loads(captured["messages"][1]["content"].split("\n", 1)[1])
    assert set(payload) >= {"account", "score", "recentActivities", "contacts", "likelyProduct", "scoreChange"}
    assert payload["score"]["total"] == 86
    assert "Do NOT invent" in captured["messages"][0]["content"]


def test_grounding_guard_without_contacts(client, seeded_db, with_key, monkeypatch):
    invented = dict(VALID, recommendedPersona="Jane Doe, CTO")
    monkeypatch.setattr(ai_analyst, "_post_chat_completion", lambda *_: _completion(json.dumps(invented)))
    cobalt = next(a for a in client.get("/api/accounts").json()["accounts"] if a["name"] == "Cobalt Security Labs")
    body = client.post(f"/api/accounts/{cobalt['id']}/analyze").json()
    assert body["analysis"]["recommendedPersona"].startswith("No relevant contact identified")


# ------------------------------------------------ HTTP status mapping


@pytest.mark.parametrize(
    "status,code", [(429, "rate_limited"), (401, "auth_error"), (402, "insufficient_credits"), (503, "provider_error"), (400, "api_error")]
)
def test_http_status_mapping(monkeypatch, status, code):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(status, json={"error": {"message": "x"}}))
    settings = ai_analyst.get_settings()
    with pytest.raises(AIServiceError) as exc:
        ai_analyst._post_chat_completion(settings, [])
    assert exc.value.code == code


def test_timeout_mapping(monkeypatch):
    def raise_timeout(*a, **k):
        raise httpx.ReadTimeout("slow")

    monkeypatch.setattr(httpx, "post", raise_timeout)
    with pytest.raises(AIServiceError) as exc:
        ai_analyst._post_chat_completion(ai_analyst.get_settings(), [])
    assert exc.value.code == "timeout"
