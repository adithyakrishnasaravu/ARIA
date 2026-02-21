from datetime import datetime, timedelta, timezone

from aria.types import DatadogEvidence, DependencyGraphResult, LogFinding, Runbook


def _now() -> datetime:
    return datetime.now(timezone.utc)


DEMO_ALERT: dict = {
    "incidentId": "inc-2026-02-20-payment-latency",
    "service": "payment-svc",
    "summary": "Payment service p99 latency at 4.2s and error rate at 12%",
    "p99LatencyMs": 4200.0,
    "errorRatePct": 12.0,
    "startedAt": (_now() - timedelta(minutes=8)).isoformat(),
}


def mock_datadog_evidence(service: str) -> DatadogEvidence:
    now = _now()
    return DatadogEvidence(
        windowStart=(now - timedelta(minutes=30)).isoformat(),
        windowEnd=now.isoformat(),
        topErrors=[
            LogFinding(
                timestamp=now.isoformat(),
                level="error",
                message=f"FATAL [{service}] Connection pool exhausted: all 100 connections in use (wait_timeout 500ms exceeded)",
            ),
            LogFinding(
                timestamp=now.isoformat(),
                level="error",
                message=f"ERROR [{service}] DB query timeout after 4200ms on SELECT payment_id FROM orders",
            ),
            LogFinding(
                timestamp=now.isoformat(),
                level="error",
                message=f"ERROR [{service}] Retry storm: 847 retries/min exceeding safe threshold of 200",
            ),
        ],
        tracesSummary="DB wait time accounts for 89% of p99 latency in payment-svc traces.",
        metricsSummary=f"CPU 34% | Memory 62% | DB connections 100/100 (saturated) | Error rate 12%",
        connectorMode="mock",
        notes=["Mock evidence — set ARIA_MODE=live with Datadog credentials for real log queries."],
    )


def mock_dependency_graph(service: str) -> DependencyGraphResult:
    if service == "payment-svc":
        return DependencyGraphResult(
            impactedServices=["checkout-svc", "order-api", "fraud-detection-svc"],
            upstreamServices=["orders-db", "redis-cache"],
            connectorMode="mock",
        )
    return DependencyGraphResult(
        impactedServices=[f"client-of-{service}"],
        upstreamServices=[f"upstream-db-for-{service}"],
        connectorMode="mock",
    )


def mock_runbooks(service: str) -> list[Runbook]:
    if service == "payment-svc":
        return [
            Runbook(
                title="Payment DB Pool Saturation Playbook",
                summary="Mitigate high p99 latency caused by connection pool exhaustion.",
                steps=[
                    "Increase orders-db pool max from 100 to 200.",
                    "Enable circuit breaker for optional downstream calls.",
                    "Set fail-fast timeout to 750ms on DB acquire path.",
                ],
                lastUsedAt=(_now() - timedelta(days=42)).isoformat(),
                similarityScore=0.93,
            ),
            Runbook(
                title="Retry Storm Containment SOP",
                summary="Reduce cascading load when retries amplify latency.",
                steps=[
                    "Apply exponential backoff with jitter on payment retries.",
                    "Cap in-flight DB requests at safe concurrency threshold.",
                    "Disable non-critical synchronous enrichments temporarily.",
                ],
                lastUsedAt=(_now() - timedelta(days=51)).isoformat(),
                similarityScore=0.86,
            ),
        ]
    return [
        Runbook(
            title=f"{service} Incident Baseline Runbook",
            summary="Generic mitigation for elevated latency and errors.",
            steps=[
                f"Scale {service} replicas by 2x.",
                "Enable circuit breaker for unstable dependencies.",
                "Verify recovery in p95/p99 and 5xx error rate.",
            ],
            lastUsedAt=(_now() - timedelta(days=30)).isoformat(),
            similarityScore=0.70,
        ),
    ]
