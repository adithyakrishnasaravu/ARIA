"""Datadog logs connector — live REST API or mock fallback."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from aria.config import config
from aria.mock_data import mock_datadog_evidence
from aria.types import DatadogEvidence, LogFinding

logger = logging.getLogger(__name__)


def fetch_evidence(service: str, window_minutes: int = 30) -> DatadogEvidence:
    if not config.connector_live("datadog"):
        return mock_datadog_evidence(service)

    now = datetime.now(timezone.utc)
    from_ = now - timedelta(minutes=window_minutes)

    try:
        resp = httpx.post(
            f"https://api.{config.datadog_site}/api/v2/logs/events/search",
            headers={
                "DD-API-KEY": config.datadog_api_key or "",
                "DD-APPLICATION-KEY": config.datadog_app_key or "",
                "Content-Type": "application/json",
            },
            json={
                "filter": {
                    "from": from_.isoformat(),
                    "to": now.isoformat(),
                    "query": f"service:{service} (status:error OR level:error OR @level:error)",
                },
                "sort": "timestamp",
                "page": {"limit": 20},
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        top_errors: list[LogFinding] = []
        for item in (data.get("data") or [])[:8]:
            attrs = (item.get("attributes") or {})
            nested = attrs.get("attributes") or {}
            top_errors.append(
                LogFinding(
                    timestamp=attrs.get("timestamp", now.isoformat()),
                    level=attrs.get("status", "error"),
                    message=nested.get("message") or attrs.get("message") or "Unknown log line",
                )
            )

        return DatadogEvidence(
            windowStart=from_.isoformat(),
            windowEnd=now.isoformat(),
            topErrors=top_errors,
            tracesSummary="Datadog APM traces available via MCP in production deployment.",
            metricsSummary=f"Live query returned {len(top_errors)} error events in {window_minutes}m window.",
            connectorMode="live",
        )

    except Exception as exc:
        logger.warning("Datadog live query failed (%s), using mock.", exc)
        fallback = mock_datadog_evidence(service)
        return fallback.model_copy(
            update={"notes": [*fallback.notes, f"Live query failed: {exc}"]}
        )
