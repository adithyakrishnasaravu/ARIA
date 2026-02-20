import { Runbook } from "../types";

const HARDCODED_RUNBOOKS: Record<string, Runbook[]> = {
  "payment-svc": [
    {
      title: "Payment DB Pool Saturation Playbook",
      summary:
        "Mitigate high p99 latency and elevated errors caused by connection pool exhaustion.",
      steps: [
        "Increase orders-db connection pool max size from 100 to 200.",
        "Enable circuit breaker for optional downstream calls in payment-svc.",
        "Set fail-fast timeout to 750ms on DB acquire wait path.",
      ],
      lastUsedAt: new Date(Date.now() - 42 * 24 * 60 * 60_000).toISOString(),
      similarityScore: 0.93,
    },
    {
      title: "Retry Storm Containment SOP",
      summary:
        "Reduce cascading load when retries amplify latency during dependency contention.",
      steps: [
        "Apply exponential backoff with jitter on payment retry policy.",
        "Cap in-flight requests to orders-db at a safe concurrency threshold.",
        "Temporarily disable non-critical synchronous enrichments.",
      ],
      lastUsedAt: new Date(Date.now() - 51 * 24 * 60 * 60_000).toISOString(),
      similarityScore: 0.86,
    },
    {
      title: "Checkout Rollback Escalation Runbook",
      summary:
        "Rollback candidate when checkout or payment deploy correlates with error and latency surge.",
      steps: [
        "Freeze new rollout and gate traffic to previous stable version.",
        "Rollback latest checkout/payment deployment if error rate remains >8% after pool change.",
        "Post incident update with mitigation ETA to support and product channels.",
      ],
      lastUsedAt: new Date(Date.now() - 66 * 24 * 60 * 60_000).toISOString(),
      similarityScore: 0.78,
    },
  ],
};

function genericRunbooks(service: string): Runbook[] {
  return [
    {
      title: `${service} Incident Baseline Runbook`,
      summary: "Generic mitigation workflow for elevated latency and errors.",
      steps: [
        `Scale ${service} replicas by 2x.`,
        "Enable short-term circuit breaker for unstable dependencies.",
        "Verify recovery in p95/p99 latency and 5xx error rate.",
      ],
      lastUsedAt: new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString(),
      similarityScore: 0.7,
    },
    {
      title: `${service} Dependency Degradation SOP`,
      summary: "Contain impact when upstream dependencies are unstable.",
      steps: [
        "Reduce timeout and retry budgets to protect core request path.",
        "Serve degraded response for non-critical functionality.",
        "Escalate dependency owner and track remediation in incident channel.",
      ],
      lastUsedAt: new Date(Date.now() - 44 * 24 * 60 * 60_000).toISOString(),
      similarityScore: 0.64,
    },
    {
      title: `${service} Post-Stabilization Checklist`,
      summary: "Follow-up actions after immediate mitigation is complete.",
      steps: [
        "Add alert for early saturation indicator.",
        "Create post-mortem with timeline and contributing factors.",
        "Backlog preventive fixes with owners and target dates.",
      ],
      lastUsedAt: new Date(Date.now() - 56 * 24 * 60 * 60_000).toISOString(),
      similarityScore: 0.6,
    },
  ];
}

export class MongoRunbookConnector {
  async fetchRunbooks(service: string, _summary: string, limit = 3): Promise<Runbook[]> {
    const runbooks = HARDCODED_RUNBOOKS[service] ?? genericRunbooks(service);
    return runbooks.slice(0, limit);
  }
}
