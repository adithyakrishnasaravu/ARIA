"""Investigation Agent — Strands Agent with Datadog tool for autonomous log analysis."""
from __future__ import annotations

import asyncio
import logging

from aria.config import config
from aria.connectors import datadog as dd_connector
from aria.types import AlertPayload, DatadogEvidence, InvestigationResult, TriageResult

logger = logging.getLogger(__name__)


def _run_strands(alert: AlertPayload, triage: TriageResult) -> InvestigationResult | None:
    try:
        from strands import Agent, tool
        from strands.models.bedrock import BedrockModel

        @tool
        def fetch_datadog_logs(service: str, window_minutes: int = 30) -> str:
            """Fetch recent error logs from Datadog for the given service and time window."""
            evidence = dd_connector.fetch_evidence(service, window_minutes)
            return evidence.model_dump_json()

        model = BedrockModel(model_id=config.bedrock_model_id, region_name=config.aws_region)
        agent = Agent(
            model=model,
            tools=[fetch_datadog_logs],
            system_prompt=(
                "You are ARIA's investigation specialist. "
                "Use fetch_datadog_logs to collect evidence for the incident service. "
                "After calling the tool, respond ONLY with the raw JSON from the tool result."
            ),
        )
        prompt = (
            f"Service: {alert.service}. Severity: {triage.severity}. "
            f"Window: {triage.investigationWindowMinutes} minutes. "
            "Fetch Datadog logs now."
        )
        result = agent(prompt)

        # The agent may return the tool result directly or a summary — extract DatadogEvidence
        text = str(result)
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1:
            import json

            try:
                data = json.loads(text[start : end + 1])
                evidence = DatadogEvidence(**data)
                return InvestigationResult(datadog=evidence)
            except Exception:
                pass
    except Exception as exc:
        logger.warning("Strands investigation failed (%s), falling back to direct connector.", exc)
    return None


class InvestigationAgent:
    async def run(self, alert: AlertPayload, triage: TriageResult) -> InvestigationResult:
        if config.connector_live("bedrock"):
            result = await asyncio.to_thread(_run_strands, alert, triage)
            if result:
                return result

        # Direct connector fallback
        evidence = await asyncio.to_thread(dd_connector.fetch_evidence, alert.service, triage.investigationWindowMinutes)
        return InvestigationResult(datadog=evidence)
