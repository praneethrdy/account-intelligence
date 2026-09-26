"""Pydantic API schemas. JSON uses camelCase; Python uses snake_case."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator
from pydantic.alias_generators import to_camel

from app.models.activity import ACTIVITY_TYPES
from app.services.time_utils import iso_utc, to_naive_utc

UTCDateTime = Annotated[datetime, PlainSerializer(iso_utc, return_type=str)]
Priority = Literal["HIGH", "MEDIUM", "LOW"]


class APIModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------------------------------------------------------------- accounts
class AccountOut(APIModel):
    id: int
    name: str
    industry: str | None = None
    employee_count: int | None = None
    website: str | None = None
    target_industry: bool | None = None
    created_at: UTCDateTime | None = None


class ScoreBreakdown(APIModel):
    fit: int
    intent: int
    engagement: int
    recency: int
    total: int
    priority: Priority
    calculated_at: UTCDateTime


class ScoreChange(APIModel):
    current: int
    previous: int | None
    delta: int
    previous_at: UTCDateTime | None
    has_previous: bool


class SignalRef(APIModel):
    id: int | None
    activity_type: str
    title: str
    detail: str | None = None
    timestamp: UTCDateTime


class ActionSummary(APIModel):
    action: str
    label: str


class AccountListItem(AccountOut):
    score: int
    priority: Priority
    score_change: ScoreChange
    latest_signal: SignalRef | None
    last_activity_at: UTCDateTime | None
    recommended_action: ActionSummary


class DashboardSummary(APIModel):
    total: int
    high: int
    medium: int
    low: int


class AccountListResponse(APIModel):
    accounts: list[AccountListItem]
    summary: DashboardSummary


class AccountDetail(AccountOut):
    score: ScoreBreakdown
    score_change: ScoreChange


# -------------------------------------------------------------- activities
class ActivityOut(APIModel):
    id: int
    account_id: int
    activity_type: str
    timestamp: UTCDateTime
    metadata: dict[str, Any] | None = Field(default=None, validation_alias="metadata_")
    is_future: bool = False


class ActivityCreate(APIModel):
    activity_type: str
    timestamp: datetime
    metadata: dict[str, Any] | None = None

    @field_validator("activity_type")
    @classmethod
    def _valid_type(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in ACTIVITY_TYPES:
            raise ValueError(f"Unsupported activity type. Use one of: {', '.join(ACTIVITY_TYPES)}")
        return v

    @field_validator("timestamp")
    @classmethod
    def _utc(cls, v: datetime) -> datetime:
        return to_naive_utc(v)


class TimelineItem(APIModel):
    id: int
    activity_type: str
    category: str
    title: str
    detail: str | None
    timestamp: UTCDateTime
    is_future: bool
    counted_in_score: bool
    excluded_reason: str | None = None


class TimelineResponse(APIModel):
    account_id: int
    items: list[TimelineItem]
    message: str | None = None


# ---------------------------------------------------------------- contacts
class ContactOut(APIModel):
    id: int | None
    name: str
    job_title: str | None
    email: str | None
    persona: str
    is_decision_maker: bool
    engaged: bool
    engagement_count: int
    relevance: int


class ContactsResponse(APIModel):
    contacts: list[ContactOut]
    primary_contact: ContactOut | None
    message: str | None = None
    decision_maker_message: str | None = None


# ------------------------------------------------------------------- score
class ScoreComponent(APIModel):
    key: str
    label: str
    points: int
    max: int
    lines: list[str]


class ScorePoint(APIModel):
    calculated_at: UTCDateTime
    total: int
    fit: int
    intent: int
    engagement: int
    recency: int


class DataQuality(APIModel):
    future_activities: int
    duplicate_activities: int
    outside_window: int
    missing_fields: list[str]


class ScoreDetailResponse(APIModel):
    account_id: int
    current: ScoreBreakdown
    components: list[ScoreComponent]
    change: ScoreChange
    history: list[ScorePoint]
    data_quality: DataQuality


# ------------------------------------------------------------ intelligence
class ChangeDriverOut(APIModel):
    label: str
    points: int
    kind: str
    activity_id: int | None = None
    activity_type: str | None = None
    timestamp: UTCDateTime | None = None
    note: str | None = None


class WhatChangedOut(APIModel):
    has_previous: bool
    previous_score: int | None
    current_score: int
    delta: int
    previous_at: UTCDateTime | None
    drivers: list[ChangeDriverOut]
    new_signal_count: int
    zero_point_signals: int
    explanation: str


class ProductInterestOut(APIModel):
    product: str
    confidence: str
    evidence: list[str]
    scores: dict[str, float]


class NextActionOut(APIModel):
    action: str
    label: str
    explanation: str
    reasons: list[str]
    target: ContactOut | None
    notes: list[str]


class TrendPoint(APIModel):
    date: str
    intent: int
    engagement: int
    trigger: int


class SignalStatus(APIModel):
    has_meaningful_activity: bool
    message: str | None


class IntelligenceResponse(APIModel):
    account: AccountOut
    score: ScoreDetailResponse
    what_changed: WhatChangedOut
    product_interest: ProductInterestOut
    contacts: ContactsResponse
    next_best_action: NextActionOut
    activity_trend: list[TrendPoint]
    signal_status: SignalStatus
    ai_configured: bool


# ---------------------------------------------------------------------- AI
class AIAnalysis(APIModel):
    summary: str
    why_important: str
    likely_need: str
    recommended_persona: str
    next_best_action: str
    reason_for_action: str
    personalized_message: str


class AnalyzeResponse(APIModel):
    status: Literal["ok", "unavailable"]
    analysis: AIAnalysis | None = None
    model: str | None = None
    generated_at: UTCDateTime
    error_code: str | None = None
    message: str | None = None
    deterministic_next_action: NextActionOut
    grounding_notes: list[str] = []


class ErrorResponse(APIModel):
    detail: str
