"""Infer likely product interest from the content of actual account activity."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Iterable

from app.services.scoring import activity_metadata
from app.services.signals import describe

CLOUD = "Cloud Integration"
SECURITY = "Cybersecurity"
ANALYTICS = "Data Analytics"
PRODUCTS = (CLOUD, SECURITY, ANALYTICS)
INSUFFICIENT = "Insufficient signals"

_KEYWORDS: dict[str, str] = {
    CLOUD: r"\bcloud\b|\bintegrations?\b|\bapis?\b|\bmigration\b|\bconnectors?\b|\bhybrid\b|\bipaas\b",
    SECURITY: r"\bsecurity\b|\bcyber|\bthreat|\bzero[- ]trust\b|\bsiem\b|\bsoc ?2\b|\bvulnerabilit|\bransomware\b|\bcompliance\b",
    ANALYTICS: r"\banalytics\b|\bdashboards?\b|\bbi\b|\bdata warehouse\b|\breporting\b|\bdata platform\b|\bforecasting\b",
}

# How strongly each signal type indicates product interest.
_TYPE_WEIGHT = {
    "DEMO_REQUEST": 5,
    "PRICING_PAGE_VIEW": 4,
    "DECISION_MAKER_ENGAGEMENT": 4,
    "PRODUCT_PAGE_VIEW": 3,
    "CONTENT_DOWNLOAD": 3,
    "EMAIL_CLICK": 2,
    "HIRING_ACTIVITY": 2,
    "COMPANY_EXPANSION": 1,
    "WEBSITE_VISIT": 1,
    "EMAIL_OPEN": 0.5,
}

MIN_EVIDENCE_POINTS = 5
MIN_EVIDENCE_SIGNALS = 2


@dataclass
class ProductInterest:
    product: str  # one of PRODUCTS or INSUFFICIENT
    confidence: str  # high | medium | low | none
    scores: dict[str, float] = field(default_factory=dict)
    evidence: list[str] = field(default_factory=list)


def _products_for(activity: Any) -> set[str]:
    meta = activity_metadata(activity)
    explicit = str(meta.get("product") or "").strip()
    if explicit in PRODUCTS:
        return {explicit}
    text = " ".join(str(v) for v in meta.values() if isinstance(v, (str, int, float)))
    found = set()
    for product, pattern in _KEYWORDS.items():
        if re.search(pattern, text, flags=re.IGNORECASE):
            found.add(product)
    return found


def infer_product_interest(signals: Iterable[Any]) -> ProductInterest:
    scores = {p: 0.0 for p in PRODUCTS}
    evidence: dict[str, list[tuple[float, datetime, str]]] = {p: [] for p in PRODUCTS}
    for a in signals:
        weight = _TYPE_WEIGHT.get(a.activity_type, 0)
        for product in _products_for(a):
            scores[product] += weight
            title, detail = describe(a)
            evidence[product].append((weight, a.timestamp, f"{title}{': ' + detail if detail else ''}"))

    ranked = sorted(PRODUCTS, key=lambda p: -scores[p])
    top, second = ranked[0], ranked[1]
    top_score = scores[top]
    if (
        top_score < MIN_EVIDENCE_POINTS
        or len(evidence[top]) < MIN_EVIDENCE_SIGNALS
        or top_score == scores[second]
    ):
        return ProductInterest(INSUFFICIENT, "none", scores, [])

    ratio = top_score / scores[second] if scores[second] else float("inf")
    if top_score >= 10 and ratio >= 1.5:
        confidence = "high"
    elif ratio >= 1.25:
        confidence = "medium"
    else:
        confidence = "low"
    # Strongest, most recent evidence first; deduplicated.
    seen: set[str] = set()
    ordered = [e for _, _, e in sorted(evidence[top], key=lambda x: (-x[0], -x[1].timestamp()))]
    unique = [e for e in ordered if not (e in seen or seen.add(e))]
    return ProductInterest(top, confidence, scores, unique[:6])
