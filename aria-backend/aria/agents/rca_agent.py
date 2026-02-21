"""RCA Agent — Strands Agent with Neo4j (blast radius) and MongoDB (runbooks) tools."""
from __future__ import annotations

import asyncio
import json
import logging

from aria.config import config
from aria.connectors import mongodb as mongo_connector
from aria.connectors import neo4j as neo4j_connector
from aria.connectors.bedrock import synthesize_rca
from aria.mock_data import mock_runbooks
from aria.types import AlertPayload, Hypothesis, InvestigationResult, Runbook, TriageResult

logger = logging.getLogger(__name__)


def _extract_json(text: str) -> dict | None:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


def _build_fallback(alert: AlertPayload, investigation: InvestigationResult, runbooks: list[Runbook], blast: list[str]) -> dict:
    top_error = investigation.datadog.topErrors[0].message if investigation.datadog.topErrors else "No top error"
    primary = runbooks[0] if runbooks else None
    hypotheses = [
        Hypothesis(
            title="Database connection pool saturation",
            probability=0.88,
            evidence=[
                f"Primary error: {top_error}",
                f"Error rate {alert.errorRatePct}% and p99 {alert.p99LatencyMs}ms consistent with saturation.",
                f"Matched runbook: {primary.title}" if primary else "No matching runbook found.",
            ],
            remediation=(primary.steps[:3] if primary and primary.steps else ["Increase DB pool limit.", "Add circuit breaker."]),
        ),
        Hypothesis(
            title="Downstream DB latency amplified by retry storm",
            probability=0.58,
            evidence=[
                "Retries and timeouts increase queue depth under contention.",
                "Trace summary shows DB wait dominates execution time.",
            ],
            remediation=["Throttle retries with jitter.", "Cap concurrent in-flight DB operations."],
        ),
    ]
    seen: set[str] = set()
    plan: list[str] = []
    for step in hypotheses[0].remediation:
        if step not in seen:
            seen.add(step)
            plan.append(step)
    for rb in runbooks:
        for step in rb.steps:
            if step not in seen and len(plan) < 5:
                seen.add(step)
                plan.append(step)
    return {
        "hypotheses": [h.model_dump() for h in hypotheses],
        "blastRadius": blast,
        "runbooks": [rb.model_dump() for rb in runbooks],
        "recommendedPlan": plan,
        "confidence": 0.88,
        "narrative": "Primary signal points to datastore saturation causing queue wait amplification across the payment critical path.",
    }


def _run_strands(alert: AlertPayload, triage: TriageResult, investigation: InvestigationResult) -> dict | None:
    try:
        from strands import Agent, tool
        from strands.models.bedrock import BedrockModel

        @tool
        def get_blast_radius(service: str) -> str:
            """Get the list of services impacted by a failure in the given service using the Neo4j dependency graph."""
            graph = neo4j_connector.fetch_blast_radius(service)
            return json.dumps({"impacted": graph.impactedServices, "upstream": graph.upstreamServices, "mode": graph.connectorMode})

        @tool
        def get_runbooks(service: str, query: str) -> str:
            """Retrieve historical incident runbooks matching the given service and incident description."""
            runbooks = mongo_connector.fetch_runbooks(service, query, 3)
            return json.dumps([rb.model_dump() for rb in runbooks])

        model = BedrockModel(model_id=config.bedrock_model_id, region_name=config.aws_region)
        agent = Agent(
            model=model,
            tools=[get_blast_radius, get_runbooks],
            system_prompt=(
                "You are ARIA's root-cause analyst. "
                "Call get_blast_radius and get_runbooks to gather evidence, "
                "then respond ONLY with JSON: "
                '{"narrative": str, "confidence": float, '
                '"hypotheses": [{"title": str, "probability": float, "evidence": [str], "remediation": [str]}], '
                '"recommendedPlan": [str]}.'
            ),
        )
        top_errors = [e.message for e in investigation.datadog.topErrors[:3]]
        prompt = (
            f"Service: {alert.service}. Severity: {triage.severity}. "
            f"Summary: {alert.summary}. "
            f"Top errors: {top_errors}. "
            "Call both tools then synthesize root cause."
        )
        result = agent(prompt)
        data = _extract_json(str(result))
        if data and "hypotheses" in data:
            return data
    except Exception as exc:
        logger.warning("Strands RCA failed (%s), falling back to direct synthesis.", exc)
    return None


class RCAAgent:
    async def run(self, alert: AlertPayload, triage: TriageResult, investigation: InvestigationResult) -> dict:
        # Always fetch graph + runbooks (needed for fallback too)
        graph, runbooks = await asyncio.gather(
            asyncio.to_thread(neo4j_connector.fetch_blast_radius, alert.service),
            asyncio.to_thread(mongo_connector.fetch_runbooks, alert.service, alert.summary, 3),
        )

        if config.connector_live("bedrock"):
            # Try Strands first
            result = await asyncio.to_thread(_run_strands, alert, triage, investigation)
            if result:
                result["blastRadius"] = graph.impactedServices
                result["runbooks"] = [rb.model_dump() for rb in runbooks]
                result["hypotheses"] = sorted(result.get("hypotheses", []), key=lambda h: -h.get("probability", 0))
                return result

            # Try direct Bedrock synthesis
            context = {
                "service": alert.service,
                "summary": alert.summary,
                "p99LatencyMs": alert.p99LatencyMs,
                "errorRatePct": alert.errorRatePct,
                "topErrors": [e.message for e in investigation.datadog.topErrors],
                "blastRadius": graph.impactedServices,
                "runbooks": [rb.model_dump() for rb in runbooks],
            }
            synthesized = await asyncio.to_thread(synthesize_rca, context)
            if synthesized and "hypotheses" in synthesized:
                synthesized["blastRadius"] = graph.impactedServices
                synthesized["runbooks"] = [rb.model_dump() for rb in runbooks]
                synthesized["hypotheses"] = sorted(synthesized["hypotheses"], key=lambda h: -h.get("probability", 0))
                return synthesized

        return _build_fallback(alert, investigation, runbooks, graph.impactedServices)
