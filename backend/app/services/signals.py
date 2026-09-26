"""Human-readable descriptions of activity signals, derived only from stored data."""
from __future__ import annotations

from typing import Any

from app.services.scoring import ENGAGEMENT_POINTS, INTENT_POINTS, activity_metadata

TYPE_LABELS = {
    "WEBSITE_VISIT": "Website visit",
    "PRODUCT_PAGE_VIEW": "Product page view",
    "PRICING_PAGE_VIEW": "Pricing page visit",
    "CONTENT_DOWNLOAD": "Content download",
    "EMAIL_OPEN": "Email open",
    "EMAIL_CLICK": "Email click",
    "DEMO_REQUEST": "Demo request",
    "DECISION_MAKER_ENGAGEMENT": "Decision-maker engagement",
    "COMPANY_EXPANSION": "Company expansion",
    "HIRING_ACTIVITY": "Hiring activity",
}


def signal_category(activity_type: str) -> str:
    if activity_type in ("HIRING_ACTIVITY", "COMPANY_EXPANSION"):
        return "trigger"
    if activity_type in INTENT_POINTS:
        return "intent"
    if activity_type in ENGAGEMENT_POINTS:
        return "engagement"
    return "other"


def _s(meta: dict[str, Any], key: str) -> str | None:
    value = meta.get(key)
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def short_label(activity: Any) -> str:
    """Compact label used in "What Changed?" (e.g. "VP Engineering engagement")."""
    meta = activity_metadata(activity)
    t = activity.activity_type
    if t == "DECISION_MAKER_ENGAGEMENT" and _s(meta, "contact_title"):
        return f"{_s(meta, 'contact_title')} engagement"
    if t == "CONTENT_DOWNLOAD" and _s(meta, "asset_type"):
        return f"{_s(meta, 'asset_type').capitalize()} download"
    return TYPE_LABELS.get(t, t.replace("_", " ").capitalize())


def describe(activity: Any) -> tuple[str, str | None]:
    """(title, detail) for the timeline. Falls back gracefully if metadata is missing."""
    meta = activity_metadata(activity)
    t = activity.activity_type
    product = _s(meta, "product")
    page = _s(meta, "page")
    title_ = _s(meta, "title")
    if t == "WEBSITE_VISIT":
        return "Website visit", page or title_
    if t == "PRODUCT_PAGE_VIEW":
        return (f"{product} product page viewed" if product else "Product page viewed"), page
    if t == "PRICING_PAGE_VIEW":
        return "Pricing page viewed", (f"{product} pricing" if product else page)
    if t == "CONTENT_DOWNLOAD":
        kind = _s(meta, "asset_type") or "content"
        return f"{kind.capitalize()} downloaded", title_
    if t == "EMAIL_OPEN":
        return "Marketing email opened", _s(meta, "campaign")
    if t == "EMAIL_CLICK":
        return "Email link clicked", _s(meta, "campaign")
    if t == "DEMO_REQUEST":
        who = _s(meta, "contact_title")
        return (f"Demo requested by {who}" if who else "Demo requested"), _s(meta, "note") or product
    if t == "DECISION_MAKER_ENGAGEMENT":
        who = _s(meta, "contact_title") or "Decision-maker"
        context = _s(meta, "context")
        return (f"{who} engaged with {context}" if context else f"{who} engaged"), _s(meta, "contact_name")
    if t == "COMPANY_EXPANSION":
        return "Company expansion detected", _s(meta, "detail")
    if t == "HIRING_ACTIVITY":
        return "Hiring activity detected", _s(meta, "detail")
    return TYPE_LABELS.get(t, t), None
