"""Triage Agent — Strands Agent with Bedrock, pure LLM reasoning, rule-based fallback."""
from __future__ import annotations

import asyncio
import json
import logging

from aria.config import config
from aria.types import AlertPayload, TriageResult

logger = logging.getLogger(__name__)

_SYSTEM = """You are ARIA's triage specialist.
Analyze the alert and respond ONLY with valid JSON (no markdown):
{
  "severity": "sev1" | "sev2" | "sev3",
  "affectedService": "<service name>",
  "urgencyReason": "<1 sentence>",
  "investigationWindowMinutes": <number>
}
Severity rules: sev1 = errorRatePct >= 10% OR p99LatencyMs >= 3000; sev2 = >= 5% OR >= 2000; else sev3."""


def _rule_based(alert: AlertPayload) -> TriageResult:
    if alert.errorRatePct >= 10 or alert.p99LatencyMs >= 3000:
        sev, reason = "sev1", "High customer impact: elevated errors and latency exceed critical thresholds."
    elif alert.errorRatePct >= 5 or alert.p99LatencyMs >= 2000:
        sev, reason = "sev2", "Moderate impact: performance degradation likely visible to users."
    else:
        sev, reason = "sev3", "Low impact: continue monitoring while investigation runs."
    return TriageResult(
        severity=sev,
        affectedService=alert.service,
        urgencyReason=reason,
        investigationWindowMinutes=30,
    )


def _extract_json(text: str) -> dict | None:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


def _run_strands(alert: AlertPayload) -> TriageResult | None:
    try:
        from strands import Agent
        from strands.models.bedrock import BedrockModel

        model = BedrockModel(model_id=config.bedrock_model_id, region_name=config.aws_region)
        agent = Agent(model=model, system_prompt=_SYSTEM)
        result = agent(f"Triage this incident:\n{alert.model_dump_json(indent=2)}")
        data = _extract_json(str(result))
        if data:
            return TriageResult(**data)
    except Exception as exc:
        logger.warning("Strands triage failed (%s), using rule-based fallback.", exc)
    return None


class TriageAgent:
    async def run(self, alert: AlertPayload) -> TriageResult:
        if config.connector_live("bedrock"):
            result = await asyncio.to_thread(_run_strands, alert)
            if result:
                return result
        return _rule_based(alert)
