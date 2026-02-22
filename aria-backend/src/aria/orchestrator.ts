import { InvestigationAgent } from "./agents/investigation-agent";
import { RCAAgent } from "./agents/rca-agent";
import { TriageAgent } from "./agents/triage-agent";
import {
  AlertPayload,
  InvestigationReport,
  StreamEvent,
  TimelineStep,
} from "./types";

function step(
  agent: TimelineStep["agent"],
  status: TimelineStep["status"],
  title: string,
  detail: string,
  payload?: Record<string, unknown>,
): TimelineStep {
  return {
    id: crypto.randomUUID(),
    agent,
    status,
    title,
    detail,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export class AriaOrchestrator {
  constructor(
    private readonly triageAgent = new TriageAgent(),
    private readonly investigationAgent = new InvestigationAgent(),
    private readonly rcaAgent = new RCAAgent(),
  ) {}

  async *run(alert: AlertPayload): AsyncGenerator<StreamEvent> {
    // ── Phase 1: Fast Triage — snapshot only (~5s) ───────────────────────────
    yield {
      type: "step",
      step: step(
        "triage",
        "running",
        "Fast Triage — snapshot analysis",
        "Classifying severity from alert metrics, service profile, and operational context. No log evidence yet.",
      ),
    };

    const triageV1 = await this.triageAgent.run(alert);

    yield {
      type: "step",
      step: step(
        "triage",
        "completed",
        "Fast Triage complete",
        `Initial: ${triageV1.severity.toUpperCase()} · ${triageV1.likelyCause.replace(/_/g, " ")} · confidence ${(triageV1.confidence * 100).toFixed(0)}%.${triageV1.dataQualityWarning ? ` ⚠ ${triageV1.dataQualityWarning}` : ""}`,
        {
          severity: triageV1.severity,
          likelyCause: triageV1.likelyCause,
          confidence: triageV1.confidence,
          escalateImmediately: triageV1.escalateImmediately,
        },
      ),
    };

    // ── Investigation ────────────────────────────────────────────────────────
    yield {
      type: "step",
      step: step(
        "investigation",
        "running",
        "Investigation Agent started",
        `Pulling Datadog error logs, APM spans, metric trend, and cross-service trace correlation over ${triageV1.investigationWindowMinutes}-minute window.`,
      ),
    };

    const investigation = await this.investigationAgent.run(alert, triageV1);

    const totalLogEvents = investigation.datadog.topErrors.reduce((sum, e) => sum + (e.count ?? 1), 0);
    const crossServiceCount = investigation.datadog.crossServiceLogs?.length ?? 0;
    yield {
      type: "step",
      step: step(
        "investigation",
        "completed",
        "Investigation complete",
        `${totalLogEvents} error events across ${investigation.datadog.topErrors.length} patterns · trend ${investigation.datadog.metricTrend?.toUpperCase() ?? "unknown"} · ${crossServiceCount} cross-service log entries correlated.`,
        {
          datadogMode: investigation.datadog.connectorMode,
          metricTrend: investigation.datadog.metricTrend,
          crossServiceCount,
        },
      ),
    };

    // ── Phase 2: Re-triage with evidence (~2s) ───────────────────────────────
    yield {
      type: "step",
      step: step(
        "triage",
        "running",
        "Re-triage — evidence refined",
        "Refining severity with Datadog error patterns, metric trend, and cross-service blast radius signal.",
      ),
    };

    const triage = await this.triageAgent.refine(alert, triageV1, investigation);

    const severityChanged = triage.severity !== triageV1.severity;
    yield {
      type: "step",
      step: step(
        "triage",
        "completed",
        "Re-triage complete",
        severityChanged
          ? `Severity updated ${triageV1.severity.toUpperCase()} → ${triage.severity.toUpperCase()} after evidence review — confidence ${(triage.confidence * 100).toFixed(0)}%.`
          : `Severity confirmed ${triage.severity.toUpperCase()} — evidence aligns with snapshot. Confidence ${(triage.confidence * 100).toFixed(0)}%.`,
        {
          severity: triage.severity,
          confidence: triage.confidence,
          severityChanged,
          requiresHumanConfirmation: triage.requiresHumanConfirmation,
        },
      ),
    };

    // ── Human confirmation gate for sev1 ────────────────────────────────────
    if (triage.requiresHumanConfirmation) {
      yield { type: "confirmation_required", triage };
    }

    // ── RCA ──────────────────────────────────────────────────────────────────
    yield {
      type: "step",
      step: step(
        "rca",
        "running",
        "RCA Agent started",
        "Traversing Neo4j service graph for blast radius, matching historical runbooks, synthesizing ranked hypotheses.",
      ),
    };

    const rca = await this.rcaAgent.run(alert, triage, investigation);

    yield {
      type: "step",
      step: step(
        "rca",
        "completed",
        "Root cause synthesized",
        `Top hypothesis: ${rca.hypotheses[0]?.title ?? "unknown"} — confidence ${(rca.confidence * 100).toFixed(0)}% · ${rca.blastRadius.length} impacted services · ${rca.runbooks.length} runbooks matched.`,
        {
          confidence: rca.confidence,
          blastRadiusSize: rca.blastRadius.length,
          topHypothesis: rca.hypotheses[0]?.title,
        },
      ),
    };

    // ── Remediation ──────────────────────────────────────────────────────────
    yield {
      type: "step",
      step: step(
        "remediation",
        "running",
        "Remediation Agent started",
        "Prioritizing action plan from ranked hypotheses, runbook history, and blast radius scope.",
      ),
    };

    yield {
      type: "step",
      step: step(
        "remediation",
        "completed",
        "Remediation plan ready",
        `${rca.recommendedPlan.length} prioritized actions from ${rca.runbooks.length} matched runbooks — ready for engineer review and execution.`,
        {
          planSteps: rca.recommendedPlan.length,
          runbooksMatched: rca.runbooks.length,
        },
      ),
    };

    const report: InvestigationReport = {
      alert,
      triage,
      investigation,
      rca,
    };

    yield { type: "report", report };
  }
}
