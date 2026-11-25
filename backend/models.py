"""Shared Pydantic schemas for IncidentLens pipeline."""
from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

EvidenceKind = Literal["log", "trace", "metric"]
SeverityLevel = Literal["critical", "high", "medium", "low"]
IncidentStatus = Literal["open", "investigated", "verified"]
FindingKind = Literal["conclusion", "hypothesis"]
ClaimType = Literal["root_cause", "error", "spike", "latency", "correlation", "visual"]


class AnomalyFlag(BaseModel):
    code: str
    severity: Literal["critical", "warning", "info"] = "warning"
    label: str
    detail: str
    metric_name: str | None = None
    z_score: float | None = None
    value: float | None = None


class EvidenceItem(BaseModel):
    id: str
    ts: str
    source: str
    service: str
    kind: EvidenceKind
    raw: str
    template_id: str | None = None
    template: str | None = None
    level: str | None = None
    duration_ms: float | None = None
    trace_id: str | None = None
    span_id: str | None = None
    metric_name: str | None = None
    metric_value: float | None = None
    flags: list[AnomalyFlag] = Field(default_factory=list)


class MetricPoint(BaseModel):
    ts: str
    service: str
    metric_name: str
    value: float
    z_score: float | None = None
    is_anomaly: bool = False
    evidence_id: str


class TimelineSummary(BaseModel):
    incident_id: str
    services: list[str]
    total_items: int
    anomaly_count: int
    anomaly_window: list[str] | None = None
    items: list[EvidenceItem]
    metric_series: dict[str, list[MetricPoint]]


class DeciderQuestionResult(BaseModel):
    question_key: str
    question_type: Literal["noul", "choice", "score", "box"]
    instructions: str
    answer: Any
    confidence: float | None = None
    probabilities: dict[str, float] | None = None


class DecisionTraceRecord(BaseModel):
    stage: str
    model: str
    mode: Literal["live", "replay"]
    latency_ms: float
    input_tokens: int = 0
    output_tokens: int = 0
    cost: float = 0.0
    request_id: str | None = None
    questions: list[DeciderQuestionResult] = Field(default_factory=list)


class Finding(BaseModel):
    id: str
    claim: str
    claim_type: ClaimType = "error"
    evidence_ids: list[str] = Field(default_factory=list)
    quote: str = ""
    confidence: float = 0.0
    kind: FindingKind = "hypothesis"
    service: str | None = None
    demotion_reason: str | None = None
    verification_passed: bool = False
    decider_signals: dict[str, Any] = Field(default_factory=dict)


class VerificationSummary(BaseModel):
    total_findings: int
    conclusions_count: int
    hypotheses_count: int
    citation_validity_rate: float
    checks: list[dict[str, Any]] = Field(default_factory=list)


class InvestigationResult(BaseModel):
    incident_id: str
    title: str
    mode: Literal["live", "replay"]
    model: str
    opened_at: str
    investigated_at: str
    severity: SeverityLevel
    status: IncidentStatus
    root_cause_summary: str
    root_cause_chain: list[str] = Field(default_factory=list)
    tool_trace: list[dict[str, Any]] = Field(default_factory=list)
    decision_traces: list[DecisionTraceRecord] = Field(default_factory=list)
    image_assessment: dict[str, Any] | None = None
    conclusions: list[Finding] = Field(default_factory=list)
    hypotheses: list[Finding] = Field(default_factory=list)
    verification: VerificationSummary
    evidence_map: dict[str, EvidenceItem] = Field(default_factory=dict)


class IncidentMetadata(BaseModel):
    id: str
    title: str
    services: list[str]
    opened_at: str
    severity: SeverityLevel
    status: IncidentStatus
    root_cause: str | None = None
    has_image: bool = False
    log_count: int = 0
    trace_count: int = 0
    metric_count: int = 0
    anomaly_count: int = 0
    model: str = "perplexity/pplx-decider-flash-v1.3:free"
