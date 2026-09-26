"""Deterministic next-best-action engine."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.personas import RankedContact
from app.services.product_interest import INSUFFICIENT, ProductInterest
from app.services.scoring import ScoreResult, activity_metadata

CONTACT_DECISION_MAKER = "CONTACT_DECISION_MAKER"
SEND_PERSONALIZED_EMAIL = "SEND_PERSONALIZED_EMAIL"
SCHEDULE_DEMO = "SCHEDULE_DEMO"
NURTURE_ACCOUNT = "NURTURE_ACCOUNT"
MONITOR_ACCOUNT = "MONITOR_ACCOUNT"

STRONG_INTENT = 15
MODERATE_INTENT = 8
MODERATE_ENGAGEMENT = 6

NO_CONTACT_MSG = "No relevant contact identified."
NO_DECISION_MAKER_MSG = "No decision-maker persona identified."


@dataclass
class NextBestAction:
    action: str
    label: str
    explanation: str
    reasons: list[str] = field(default_factory=list)
    target: RankedContact | None = None
    notes: list[str] = field(default_factory=list)


def _title(c: RankedContact | None) -> str | None:
    if c is None:
        return None
    return c.job_title or c.name


def recommend_next_action(
    score: ScoreResult,
    contacts: list[RankedContact],
    in_window_signals: list[Any],
    product: ProductInterest,
) -> NextBestAction:
    decision_makers = [c for c in contacts if c.is_decision_maker]
    best_dm = decision_makers[0] if decision_makers else None
    best_contact = contacts[0] if contacts else None
    product_phrase = f" around {product.product}" if product.product != INSUFFICIENT else ""

    notes: list[str] = []
    if not contacts:
        notes.append(NO_CONTACT_MSG)
    elif not decision_makers:
        notes.append(NO_DECISION_MAKER_MSG)

    base_reasons = [
        f"Account score {score.total}/100 ({score.priority} priority)",
        f"Intent {score.intent}/30, engagement {score.engagement}/20, recency {score.recency}/20",
    ]

    # 1. Insufficient activity.
    if score.considered_count == 0:
        return NextBestAction(
            MONITOR_ACCOUNT,
            "Monitor account for new signals",
            "No meaningful activity detected in the last 30 days. Insufficient signals to "
            "determine buying intent, so outreach now would be premature.",
            base_reasons + ["No activity in the 30-day signal window"],
            None,
            notes,
        )

    # 2. An explicit demo request trumps everything else.
    demo = next((a for a in reversed(in_window_signals) if a.activity_type == "DEMO_REQUEST"), None)
    if demo is not None:
        meta = activity_metadata(demo)
        requester = next(
            (c for c in contacts if c.email and c.email.lower() == str(meta.get("contact_email", "")).lower()),
            None,
        )
        target = requester or best_dm or best_contact
        who = _title(target)
        return NextBestAction(
            SCHEDULE_DEMO,
            f"Schedule demo with {who}" if who else "Schedule requested demo",
            "The account explicitly requested a demo. Respond quickly and book the session"
            f"{product_phrase} while intent is at its peak.",
            base_reasons + ["Demo request received in the last 30 days"],
            target,
            notes,
        )

    # 3. High score + strong intent.
    if score.priority == "HIGH" and score.intent >= STRONG_INTENT:
        if best_dm is not None:
            engaged = " who has already engaged" if best_dm.engaged else ""
            return NextBestAction(
                CONTACT_DECISION_MAKER,
                f"Contact {_title(best_dm)}",
                f"Strong buying intent and a relevant {best_dm.persona.lower()}{engaged} make this "
                f"the right moment for direct outreach to {best_dm.name}{product_phrase}.",
                base_reasons + [f"Decision-maker available: {best_dm.name} ({best_dm.persona})"],
                best_dm,
                notes,
            )
        who = _title(best_contact)
        return NextBestAction(
            SEND_PERSONALIZED_EMAIL,
            f"Send personalized email to {who}" if who else "Identify a contact, then send personalized email",
            (
                f"Intent is strong but no decision-maker persona is on file. Engage {best_contact.name} "
                f"({best_contact.persona}) and ask for an introduction to the buying team."
                if best_contact
                else "Intent is strong but no contacts are on file. Source a technical evaluator "
                "for this account before outreach."
            ),
            base_reasons,
            best_contact,
            notes,
        )

    # 4. Medium/High score with moderate engagement or intent.
    if score.priority in ("HIGH", "MEDIUM") and (
        score.engagement >= MODERATE_ENGAGEMENT or score.intent >= MODERATE_INTENT
    ):
        target = best_dm or best_contact
        who = _title(target)
        return NextBestAction(
            SEND_PERSONALIZED_EMAIL,
            f"Send personalized email to {who}" if who else "Identify a contact, then send personalized email",
            "The account shows moderate engagement but not yet strong buying intent. A personalized "
            f"email{product_phrase} can convert interest into a conversation.",
            base_reasons,
            target,
            notes,
        )

    # 5. Very thin activity -> monitor; otherwise nurture.
    if score.considered_count < 2 and score.intent == 0:
        return NextBestAction(
            MONITOR_ACCOUNT,
            "Monitor account for new signals",
            "Only a single low-value signal is available. Insufficient activity to justify outreach.",
            base_reasons,
            None,
            notes,
        )
    return NextBestAction(
        NURTURE_ACCOUNT,
        "Add to nurture program",
        "Signals are weak or cooling. Keep the account warm with relevant content"
        f"{product_phrase} and re-evaluate when new intent appears.",
        base_reasons,
        best_dm or best_contact,
        notes,
    )
