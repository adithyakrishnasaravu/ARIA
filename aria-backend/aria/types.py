from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class AlertPayload(BaseModel):
    incidentId: str
    service: str
    summary: str
    p99LatencyMs: float
    errorRatePct: float
    startedAt: str
    screenshotBase64: Optional[str] = None


class TriageResult(BaseModel):
    severity: str
    affectedService: str
    urgencyReason: str
    investigationWindowMinutes: int = 30


class LogFinding(BaseModel):
    timestamp: str
    level: str
    message: str


class DatadogEvidence(BaseModel):
    windowStart: str
    windowEnd: str
    topErrors: list[LogFinding]
    tracesSummary: str
    metricsSummary: str
    connectorMode: str
    notes: list[str] = []


class InvestigationResult(BaseModel):
    datadog: DatadogEvidence


class DependencyGraphResult(BaseModel):
    impactedServices: list[str]
    upstreamServices: list[str]
    connectorMode: str


class Runbook(BaseModel):
    title: str
    summary: str
    steps: list[str]
    lastUsedAt: Optional[str] = None
    similarityScore: float = 0.0


class Hypothesis(BaseModel):
    title: str
    probability: float
    evidence: list[str]
    remediation: list[str]


class RCAResult(BaseModel):
    hypotheses: list[Hypothesis]
    blastRadius: list[str]
    runbooks: list[Runbook]
    recommendedPlan: list[str]
    confidence: float
    narrative: str
