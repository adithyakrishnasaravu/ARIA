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
  const topError = investigation.datadog.topErrors[0];
  const topErrorMsg = topError?.message ?? "No error data available";
  const topErrorKind = topError?.errorKind;
  const primaryRunbook = runbooks[0];

  // Derive hypothesis title from actual error kind when available
  const primaryTitle = topErrorKind
    ? `${topErrorKind} in ${alert.service}`
    : `Elevated errors in ${alert.service}`;

  const primaryEvidence = [
    `Primary error: ${topErrorMsg}`,
    `Error rate ${alert.errorRatePct}% and p99 latency ${alert.p99LatencyMs}ms.`,
  ];

  if (investigation.datadog.metricTrend) {
    primaryEvidence.push(`Error trend: ${investigation.datadog.metricTrend.toUpperCase()}.`);
  }

  if (primaryRunbook) {
    primaryEvidence.push(`Historical runbook match: ${primaryRunbook.title}`);
  }

  return [
    {
      title: primaryTitle,
      probability: 0.85,
      evidence: primaryEvidence,
      remediation: primaryRunbook?.steps?.length
        ? primaryRunbook.steps.slice(0, 3)
        : [
            `Investigate recent deploys to ${alert.service} — rollback if correlated.`,
            "Check downstream service health for dependency failures.",
            "Scale replicas if load-driven.",
          ],
    },
    {
      title: "Recent deployment introduced regression",
      probability: 0.6,
      evidence: [
        "Error spike pattern is consistent with a bad deploy (sudden onset, constant error kind).",
        investigation.datadog.tracesSummary,
      ],
      remediation: [
        `Review recent ${alert.service} deployment history.`,
        "Rollback to last known good version if error rate persists > 5 minutes.",
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
      topErrors: investigation.datadog.topErrors,
      blastRadius: graph.impactedServices,
      runbooks,
      tracesSummary: investigation.datadog.tracesSummary,
      metricTrend: investigation.datadog.metricTrend,
      spanSummary: investigation.datadog.spanSummary,
      errorRateSeries: investigation.datadog.errorRateSeries,
      crossServiceLogs: investigation.datadog.crossServiceLogs,
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
