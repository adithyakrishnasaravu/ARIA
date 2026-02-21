"""Async pipeline: Triage → Investigation → RCA, yielding SSE-ready dicts."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import AsyncIterator

from aria.agents.investigation_agent import InvestigationAgent
from aria.agents.rca_agent import RCAAgent
from aria.agents.triage_agent import TriageAgent
from aria.types import AlertPayload


def _step(agent: str, status: str, title: str, detail: str, **payload) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "agent": agent,
        "status": status,
        "title": title,
        "detail": detail,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": payload or None,
    }


class AriaOrchestrator:
    def __init__(self) -> None:
        self.triage = TriageAgent()
        self.investigation = InvestigationAgent()
        self.rca = RCAAgent()

    async def run(self, alert: AlertPayload) -> AsyncIterator[dict]:
        # ── Triage ──────────────────────────────────────────────────────────
        yield {"type": "step", "step": _step("triage", "running", "Triage Agent started", "Classifying severity and identifying affected service.")}
        triage = await self.triage.run(alert)
        yield {
            "type": "step",
            "step": _step(
                "triage", "completed", "Triage complete",
                f"Severity {triage.severity.upper()} — {triage.affectedService}.",
                severity=triage.severity,
                investigationWindowMinutes=triage.investigationWindowMinutes,
            ),
        }

        # ── Investigation ────────────────────────────────────────────────────
        yield {"type": "step", "step": _step("investigation", "running", "Investigation Agent started", "Querying Datadog for the last 30 minutes.")}
        investigation = await self.investigation.run(alert, triage)
        yield {
            "type": "step",
            "step": _step(
                "investigation", "completed", "Investigation complete",
                f"Collected {len(investigation.datadog.topErrors)} high-signal log entries.",
                datadogMode=investigation.datadog.connectorMode,
            ),
        }

        # ── RCA ──────────────────────────────────────────────────────────────
        yield {"type": "step", "step": _step("rca", "running", "RCA + Remediation Agent started", "Traversing Neo4j blast radius and matching MongoDB runbooks.")}
        rca = await self.rca.run(alert, triage, investigation)
        confidence_pct = int(rca.get("confidence", 0) * 100)
        blast_size = len(rca.get("blastRadius", []))
        yield {
            "type": "step",
            "step": _step(
                "rca", "completed", "RCA synthesis complete",
                f"Top hypothesis confidence {confidence_pct}% — {blast_size} impacted services.",
                confidence=rca.get("confidence"),
                blastRadiusSize=blast_size,
            ),
        }

        yield {
            "type": "report",
            "report": {
                "alert": alert.model_dump(),
                "triage": triage.model_dump(),
                "investigation": {"datadog": investigation.datadog.model_dump()},
                "rca": rca,
            },
        }
