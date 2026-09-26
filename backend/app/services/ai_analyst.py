"""AI Account Analyst (OpenRouter).

The AI only *interprets* deterministic facts and writes outreach copy. It never
sets the score or the core next-best-action. Every failure mode (missing key,
HTTP errors, timeouts, rate limits, empty or malformed output) degrades to a
structured "unavailable" result so the rest of the product keeps working.
"""
from __future__ import annotations

import json
import logging
import os
import re
import ssl
import time
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.schemas import AIAnalysis, AnalyzeResponse, IntelligenceResponse, TimelineResponse
from app.services.time_utils import utcnow

log = logging.getLogger(__name__)

INSUFFICIENT = "Insufficient evidence from available account signals."
UNAVAILABLE_MSG = (
    "AI analysis is currently unavailable. Account scoring and deterministic recommendations are still available."
)

SYSTEM_PROMPT = f"""You are a B2B sales account analyst inside an account-intelligence product.

STRICT GROUNDING RULES
- Use ONLY the JSON data supplied by the user message. It is the complete truth.
- Do NOT invent people, job titles, activities, company facts, product usage, pricing,
  previous conversations, business outcomes, or customer requirements.
- Only name contacts that appear in "contacts". If "contacts" is empty, say no contact is identified.
- The numeric score and "deterministicNextAction" were computed by the backend. Do not change
  the numbers. Your nextBestAction must be consistent with deterministicNextAction.
- If the data does not support a field, write exactly: "{INSUFFICIENT}"
- The personalized message must reference only signals present in the data (no fake
  meetings, no claims about their stack, no pricing). Keep it under 120 words, plain text,
  addressed to the recommended contact by first name if one exists.

OUTPUT
Return ONLY one JSON object, no markdown, no code fences, with exactly these string keys:
"summary", "whyImportant", "likelyNeed", "recommendedPersona", "nextBestAction",
"reasonForAction", "personalizedMessage".
"""

FIELDS = [
    "summary",
    "whyImportant",
    "likelyNeed",
    "recommendedPersona",
    "nextBestAction",
    "reasonForAction",
    "personalizedMessage",
]
REQUIRED = {"summary", "nextBestAction", "personalizedMessage"}


class AIServiceError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


# ------------------------------------------------------------------ payload
def build_payload(intel: IntelligenceResponse, timeline: TimelineResponse) -> dict[str, Any]:
    """Structured, minimal, factual input for the model."""
    account = intel.account
    recent = [
        {
            "type": item.activity_type,
            "title": item.title,
            "detail": item.detail,
            "timestamp": item.timestamp.isoformat() + "Z",
        }
        for item in timeline.items
        if item.counted_in_score
    ][:15]
    nba = intel.next_best_action
    return {
        "account": {
            "name": account.name,
            "industry": account.industry,
            "employeeCount": account.employee_count,
            "website": account.website,
        },
        "score": {
            "total": intel.score.current.total,
            "priority": intel.score.current.priority,
            "fit": intel.score.current.fit,
            "intent": intel.score.current.intent,
            "engagement": intel.score.current.engagement,
            "recency": intel.score.current.recency,
            "maximums": {"fit": 30, "intent": 30, "engagement": 20, "recency": 20, "total": 100},
        },
        "recentActivities": recent,
        "contacts": [
            {
                "name": c.name,
                "jobTitle": c.job_title,
                "persona": c.persona,
                "isDecisionMaker": c.is_decision_maker,
                "engagedRecently": c.engaged,
            }
            for c in intel.contacts.contacts
        ],
        "likelyProduct": intel.product_interest.product,
        "scoreChange": {
            "previous": intel.what_changed.previous_score,
            "current": intel.what_changed.current_score,
            "delta": intel.what_changed.delta,
            "drivers": [{"label": d.label, "points": d.points} for d in intel.what_changed.drivers],
            "explanation": intel.what_changed.explanation,
        },
        "deterministicNextAction": {
            "action": nba.action,
            "label": nba.label,
            "explanation": nba.explanation,
            "targetContact": (
                {"name": nba.target.name, "jobTitle": nba.target.job_title, "persona": nba.target.persona}
                if nba.target
                else None
            ),
        },
    }


# ------------------------------------------------------------------- client
def _ssl_verify() -> ssl.SSLContext | bool:
    """Verify TLS against the operating system's trust store when available
    (handles corporate proxies / OS-installed root CAs); otherwise certifi."""
    try:
        import truststore

        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except Exception:  # pragma: no cover - optional dependency
        return True


def _post_chat_completion(settings: Settings, messages: list[dict[str, str]]) -> dict[str, Any]:
    """Single HTTP call to OpenRouter. Isolated so tests can replace it."""
    try:
        resp = httpx.post(
            f"{settings.openrouter_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": os.getenv("APP_URL", "http://localhost:5173"),
                "X-Title": "AI Account Intelligence",
            },
            json={"model": settings.openrouter_model, "messages": messages, "temperature": 0.2},
            timeout=settings.openrouter_timeout_seconds,
            verify=_ssl_verify(),
        )
    except httpx.TimeoutException as exc:
        raise AIServiceError("timeout", "The AI provider timed out.", retryable=True) from exc
    except httpx.HTTPError as exc:
        log.warning("OpenRouter connection error: %s: %s", type(exc).__name__, exc)
        raise AIServiceError("network_error", "Could not reach the AI provider.", retryable=True) from exc

    if resp.status_code == 429:
        raise AIServiceError("rate_limited", "The AI provider rate limit was reached. Try again shortly.")
    if resp.status_code in (401, 403):
        raise AIServiceError("auth_error", "The AI provider rejected the API key.")
    if resp.status_code == 402:
        raise AIServiceError("insufficient_credits", "The AI provider account has insufficient credits.")
    if resp.status_code >= 500:
        raise AIServiceError("provider_error", f"The AI provider returned HTTP {resp.status_code}.", retryable=True)
    if resp.status_code >= 400:
        raise AIServiceError("api_error", f"The AI provider returned HTTP {resp.status_code}.")
    try:
        data = resp.json()
    except ValueError as exc:
        raise AIServiceError("invalid_response", "The AI provider returned a non-JSON response.", True) from exc
    if isinstance(data, dict) and data.get("error"):
        err = data["error"]
        code = err.get("code") if isinstance(err, dict) else None
        if code == 429:
            raise AIServiceError("rate_limited", "The AI provider rate limit was reached. Try again shortly.")
        raise AIServiceError("api_error", "The AI provider returned an error.", retryable=True)
    return data


def _extract_content(data: dict[str, Any]) -> str:
    try:
        content = data["choices"][0]["message"].get("content")
    except (KeyError, IndexError, TypeError, AttributeError) as exc:
        raise AIServiceError("invalid_response", "The AI response had an unexpected shape.", True) from exc
    if isinstance(content, list):  # some providers return content parts
        content = "".join(p.get("text", "") for p in content if isinstance(p, dict))
    if not content or not str(content).strip():
        raise AIServiceError("empty_response", "The AI model returned an empty response.", True)
    return str(content)


def _norm_key(key: str) -> str:
    return re.sub(r"[^a-z]", "", key.lower())


_KEY_MAP = {_norm_key(f): f for f in FIELDS}


def parse_analysis(text: str) -> AIAnalysis:
    """Parse model text into a validated AIAnalysis, tolerating code fences,
    surrounding prose and snake_case keys. Raises AIServiceError on failure."""
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE).strip()
    obj: Any = None
    try:
        obj = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end > start:
            try:
                obj = json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                obj = None
    if not isinstance(obj, dict):
        raise AIServiceError("malformed_json", "The AI returned malformed JSON.", retryable=True)

    values: dict[str, str] = {}
    for key, value in obj.items():
        field = _KEY_MAP.get(_norm_key(str(key)))
        if field is None or value is None:
            continue
        if isinstance(value, list):
            value = " ".join(str(v) for v in value)
        elif isinstance(value, dict):
            value = json.dumps(value)
        text_value = str(value).strip()
        if text_value:
            values[field] = text_value

    missing_required = REQUIRED - values.keys()
    if missing_required:
        raise AIServiceError(
            "invalid_schema", f"The AI response was missing: {', '.join(sorted(missing_required))}.", True
        )
    for f in FIELDS:
        values.setdefault(f, INSUFFICIENT)
    try:
        return AIAnalysis.model_validate(values)
    except ValidationError as exc:
        raise AIServiceError("invalid_schema", "The AI response did not match the expected schema.") from exc


def _apply_grounding(analysis: AIAnalysis, payload: dict[str, Any]) -> tuple[AIAnalysis, list[str]]:
    """Light post-validation of AI output against the supplied facts."""
    notes = [
        "Score and core next-best-action are computed deterministically by the backend.",
        "The AI was instructed to use only the supplied account data.",
    ]
    if not payload["contacts"]:
        analysis.recommended_persona = "No relevant contact identified in the available data."
        notes.append("No contacts on file: persona recommendation was constrained to avoid invented people.")
    return analysis, notes


def analyze_account(
    intel: IntelligenceResponse,
    timeline: TimelineResponse,
    settings: Settings | None = None,
    max_attempts: int = 2,
) -> AnalyzeResponse:
    settings = settings or get_settings()
    now = utcnow()

    def unavailable(code: str, detail: str) -> AnalyzeResponse:
        return AnalyzeResponse(
            status="unavailable",
            analysis=None,
            model=settings.openrouter_model,
            generated_at=now,
            error_code=code,
            message=f"{UNAVAILABLE_MSG} ({detail})",
            deterministic_next_action=intel.next_best_action,
        )

    if not settings.ai_configured:
        return unavailable("missing_api_key", "OPENROUTER_API_KEY is not configured on the server.")

    payload = build_payload(intel, timeline)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "Account data (JSON):\n" + json.dumps(payload, indent=2, default=str)},
    ]
    last_error: AIServiceError | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            data = _post_chat_completion(settings, messages)
            analysis = parse_analysis(_extract_content(data))
            analysis, notes = _apply_grounding(analysis, payload)
            return AnalyzeResponse(
                status="ok",
                analysis=analysis,
                model=str(data.get("model") or settings.openrouter_model),
                generated_at=now,
                deterministic_next_action=intel.next_best_action,
                grounding_notes=notes,
            )
        except AIServiceError as exc:
            last_error = exc
            log.warning("AI analysis attempt %s failed: %s (%s)", attempt, exc.code, exc.message)
            if not exc.retryable or attempt == max_attempts:
                break
            time.sleep(1.0)
        except Exception as exc:  # never let the AI break the product
            log.exception("Unexpected AI failure")
            last_error = AIServiceError("unexpected_error", "Unexpected error while generating AI analysis.")
            break
    assert last_error is not None
    return unavailable(last_error.code, last_error.message)
