"""Job title -> persona mapping and contact relevance ranking."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable

from app.services.scoring import activity_metadata

TECHNICAL_EVALUATOR = "Technical Evaluator"
ECONOMIC_BUYER = "Economic Buyer"
EXECUTIVE_SPONSOR = "Executive Sponsor"
INFLUENCER = "Influencer"
PROCUREMENT = "Procurement"
OTHER = "Other"

DECISION_MAKER_PERSONAS = {TECHNICAL_EVALUATOR, ECONOMIC_BUYER, EXECUTIVE_SPONSOR}

# Order matters: first match wins.
_RULES: list[tuple[str, str]] = [
    (r"\bprocurement\b|\bpurchasing\b|\bsourcing\b|\bvendor management\b", PROCUREMENT),
    (r"\bcfo\b|chief financial|vp,? finance|vice president,? finance|head of finance|finance director", ECONOMIC_BUYER),
    (r"\bceo\b|chief executive|\bpresident\b|\bfounder\b|\bcoo\b|chief operating|managing director", EXECUTIVE_SPONSOR),
    (
        r"\bcto\b|chief technology|\bcio\b|chief information|\bciso\b|chief (information )?security|"
        r"chief data|\bcdo\b|vp,? (of )?(engineering|technology|it|infrastructure|data|platform|security)|"
        r"vice president,? (of )?(engineering|technology|it|infrastructure|data|platform|security)|"
        r"head of (engineering|data|it|platform|security|infrastructure)",
        TECHNICAL_EVALUATOR,
    ),
    (r"manager|director|architect|\blead\b|principal", INFLUENCER),
]

# Base relevance of each persona when choosing who to contact.
_PERSONA_WEIGHT = {
    TECHNICAL_EVALUATOR: 50,
    EXECUTIVE_SPONSOR: 40,
    ECONOMIC_BUYER: 35,
    INFLUENCER: 20,
    PROCUREMENT: 10,
    OTHER: 5,
}


def persona_for_title(title: str | None) -> str:
    if not title:
        return OTHER
    lowered = title.lower()
    for pattern, persona in _RULES:
        if re.search(pattern, lowered):
            return persona
    return OTHER


def is_decision_maker(persona: str | None) -> bool:
    return persona in DECISION_MAKER_PERSONAS


@dataclass
class RankedContact:
    id: int | None
    name: str
    job_title: str | None
    email: str | None
    persona: str
    is_decision_maker: bool
    engaged: bool
    engagement_count: int
    relevance: int


def _engagement_count(contact: Any, activities: list[Any]) -> int:
    """Number of activities that reference this contact by email or name."""
    email = (contact.email or "").strip().lower()
    name = (contact.name or "").strip().lower()
    n = 0
    for a in activities:
        meta = activity_metadata(a)
        if (email and str(meta.get("contact_email", "")).strip().lower() == email) or (
            name and str(meta.get("contact_name", "")).strip().lower() == name
        ):
            n += 1
    return n


def rank_contacts(contacts: Iterable[Any], activities: Iterable[Any]) -> list[RankedContact]:
    """Rank contacts: decision-maker personas first, boosted if they have
    actually engaged (referenced in recent activity metadata)."""
    activities = list(activities)
    ranked: list[RankedContact] = []
    for c in contacts:
        persona = c.persona or persona_for_title(c.job_title)
        n = _engagement_count(c, activities)
        relevance = _PERSONA_WEIGHT.get(persona, 5) + (30 if n else 0) + min(n, 5) * 2
        ranked.append(
            RankedContact(
                id=getattr(c, "id", None),
                name=c.name,
                job_title=c.job_title,
                email=c.email,
                persona=persona,
                is_decision_maker=is_decision_maker(persona),
                engaged=n > 0,
                engagement_count=n,
                relevance=relevance,
            )
        )
    ranked.sort(key=lambda r: (-r.relevance, r.name))
    return ranked
