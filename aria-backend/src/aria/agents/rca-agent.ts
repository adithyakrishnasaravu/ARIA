import { BedrockReasoner } from "../connectors/bedrock";
import { MongoRunbookConnector } from "../connectors/mongodb";
import { Neo4jConnector } from "../connectors/neo4j";
import { mockRcaResult } from "../mock-data";
import {
  AlertPayload,
  Hypothesis,
  InvestigationResult,
  RCAResult,
  Runbook,
  TriageResult,
} from "../types";

function buildFallbackHypotheses(
  alert: AlertPayload,
  investigation: InvestigationResult,
  runbooks: Runbook[],
): Hypothesis[] {
  const topError = investigation.datadog.topErrors[0]?.message ?? "No top error available";
  const primaryRunbook = runbooks[0];

  return [
    {
      title: "Database connection pool saturation",
      probability: 0.88,
      evidence: [
        `Primary error pattern: ${topError}`,
        `Error rate ${alert.errorRatePct}% and p99 latency ${alert.p99LatencyMs}ms are consistent with saturation.`,
        primaryRunbook ? `Matched runbook: ${primaryRunbook.title}` : "No close historical runbook found.",
      ],
      remediation: primaryRunbook?.steps?.length
        ? primaryRunbook.steps.slice(0, 3)
        : [
            "Increase DB pool limit.",
            "Add fast-fail timeout and circuit breaker in payment critical path.",
          ],
    },
    {
      title: "Downstream DB latency amplified by retry storm",
      probability: 0.58,
      evidence: [
        "Retries and timeouts increase queue depth under contention.",
        "Trace summary indicates waiting time dominates execution time.",
      ],
      remediation: [
        "Throttle retries and apply jitter.",
        "Set upper bound on concurrent in-flight DB operations.",
      ],
    },
  ];
}

function pickRecommendedPlan(hypotheses: Hypothesis[], runbooks: Runbook[]): string[] {
  const dedupe = new Set<string>();
  const plan: string[] = [];

  for (const action of hypotheses[0]?.remediation ?? []) {
    if (!dedupe.has(action)) {
      dedupe.add(action);
      plan.push(action);
    }
  }

  for (const runbook of runbooks) {
    for (const step of runbook.steps) {
      if (!dedupe.has(step) && plan.length < 5) {
        dedupe.add(step);
        plan.push(step);
      }
    }
  }

  return plan;
}

export class RCAAgent {
  constructor(
    private readonly neo4j = new Neo4jConnector(),
    private readonly runbooks = new MongoRunbookConnector(),
    private readonly reasoner = new BedrockReasoner(),
  ) {}

  async run(
    alert: AlertPayload,
    _triage: TriageResult,
    investigation: InvestigationResult,
  ): Promise<RCAResult> {
    const [graph, runbooks] = await Promise.all([
      this.neo4j.fetchBlastRadius(alert.service),
      this.runbooks.fetchRunbooks(alert.service, alert.summary, 3),
    ]);

    const synthesized = await this.reasoner.synthesize({
      service: alert.service,
      summary: alert.summary,
      p99LatencyMs: alert.p99LatencyMs,
      errorRatePct: alert.errorRatePct,
      topErrors: investigation.datadog.topErrors.map((log) => log.message),
      blastRadius: graph.impactedServices,
      runbooks,
    });

    if (synthesized) {
      const sortedHypotheses = [...synthesized.hypotheses].sort(
        (a, b) => b.probability - a.probability,
      );

      return {
        hypotheses: sortedHypotheses,
        blastRadius: graph.impactedServices,
        runbooks,
        recommendedPlan: synthesized.recommendedPlan,
        confidence: synthesized.confidence,
        narrative: synthesized.narrative,
      };
    }

    const fallback = mockRcaResult(alert.service);
    const hypotheses = buildFallbackHypotheses(alert, investigation, runbooks);

    return {
      ...fallback,
      hypotheses,
      blastRadius: graph.impactedServices.length
        ? graph.impactedServices
        : fallback.blastRadius,
      runbooks: runbooks.length ? runbooks : fallback.runbooks,
      recommendedPlan: pickRecommendedPlan(hypotheses, runbooks),
      confidence: hypotheses[0]?.probability ?? fallback.confidence,
      narrative:
        "Primary signal points to datastore saturation causing queue wait amplification across payment critical path.",
    };
  }
}
