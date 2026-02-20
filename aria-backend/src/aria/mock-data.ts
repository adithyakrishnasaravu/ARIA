import { AlertPayload, DatadogEvidence, DependencyGraphResult, RCAResult, Runbook } from "./types";

export const demoAlert: AlertPayload = {
  incidentId: "inc-2026-02-20-payment-latency",
  service: "payment-svc",
  summary: "Payment service p99 latency at 4.2s and error rate at 12%",
  p99LatencyMs: 4200,
  errorRatePct: 12,
  startedAt: new Date(Date.now() - 7 * 60_000).toISOString(),
};

export function mockDatadogEvidence(service: string): DatadogEvidence {
  const now = Date.now();
  return {
    windowStart: new Date(now - 30 * 60_000).toISOString(),
    windowEnd: new Date(now).toISOString(),
    topErrors: [
      {
        timestamp: new Date(now - 2 * 60_000).toISOString(),
        level: "error",
        message: `${service}: database connection timeout while acquiring pool slot`,
        count: 134,
      },
      {
        timestamp: new Date(now - 4 * 60_000).toISOString(),
        level: "error",
        message: `${service}: pg pool exhausted (active=100, waiting=245)`,
        count: 92,
      },
      {
        timestamp: new Date(now - 8 * 60_000).toISOString(),
        level: "warn",
        message: `${service}: retries to orders-db exceeded threshold`,
        count: 55,
      },
    ],
    tracesSummary:
      "99th percentile span latency is concentrated in `DB Acquire Connection` spans, with queue wait spikes in the last 12 minutes.",
    metricsSummary:
      "CPU and memory on payment-svc are stable; DB connection utilization is pegged near 100%.",
    connectorMode: "mock",
    notes: ["Using synthetic Datadog data for deterministic demo."],
  };
}

export function mockDependencyGraph(service: string): DependencyGraphResult {
  if (service.includes("payment")) {
    return {
      impactedServices: [
        "checkout-svc",
        "order-svc",
        "invoice-svc",
        "notification-svc",
      ],
      upstreamServices: ["api-gateway", "identity-svc"],
      connectorMode: "mock",
    };
  }

  return {
    impactedServices: ["api-gateway"],
    upstreamServices: ["web-frontend"],
    connectorMode: "mock",
  };
}

export function mockRunbooks(service: string): Runbook[] {
  return [
    {
      title: `${service} DB Pool Saturation Playbook`,
      summary:
        "When DB pool utilization exceeds 95% and p99 latency rises, increase pool and enable fail-fast behavior.",
      steps: [
        "Scale connection pool max size from 100 to 200.",
        "Enable circuit breaker in payment-svc for non-critical calls.",
        "Reduce synchronous writes in order finalization path.",
      ],
      lastUsedAt: new Date(Date.now() - 6 * 7 * 24 * 60 * 60_000).toISOString(),
      similarityScore: 0.93,
    },
    {
      title: "Database Hot Partition Mitigation",
      summary:
        "If read hot spots emerge, reroute reads to replica and enable adaptive cache policy.",
      steps: [
        "Shift 30% read traffic to read replica.",
        "Enable request-level timeout at 800ms for enrichment calls.",
      ],
      lastUsedAt: new Date(Date.now() - 42 * 24 * 60 * 60_000).toISOString(),
      similarityScore: 0.74,
    },
  ];
}

export function mockRcaResult(service: string): RCAResult {
  const runbooks = mockRunbooks(service);

  return {
    hypotheses: [
      {
        title: "orders-db connection pool limit reached",
        probability: 0.91,
        evidence: [
          "Datadog logs show repeated pool exhaustion and acquire timeouts.",
          "Trace breakdown attributes p99 latency to DB connection wait.",
          "Historical runbook from 6 weeks ago matches this signature.",
        ],
        remediation: [
          "Increase orders-db pool max to 200.",
          "Apply circuit breaker in payment-svc for optional downstream calls.",
        ],
      },
      {
        title: "Slow query burst from checkout release",
        probability: 0.62,
        evidence: [
          "Recent deploy on checkout-svc overlaps error spike window.",
          "Query latency tail is elevated but secondary to pool wait.",
        ],
        remediation: [
          "Rollback recent checkout-svc release if latency remains after pool fix.",
        ],
      },
    ],
    blastRadius: [
      "checkout-svc",
      "order-svc",
      "invoice-svc",
      "notification-svc",
    ],
    runbooks,
    recommendedPlan: [
      "Apply pool limit increase from 100 -> 200 immediately.",
      "Enable payment-svc circuit breaker and 750ms timeout for optional dependencies.",
      "Create follow-up: tune DB query plan and add saturation alert at 85% pool usage.",
    ],
    confidence: 0.91,
    narrative:
      "Highest-likelihood root cause is DB pool saturation on orders-db, triggering queue wait inflation and cascading latency across payment critical path.",
  };
}
