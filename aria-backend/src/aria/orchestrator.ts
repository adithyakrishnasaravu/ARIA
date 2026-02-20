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
    yield {
      type: "step",
      step: step(
        "triage",
        "running",
        "Triage Agent started",
        "Classifying severity and identifying affected service.",
      ),
    };

    const triage = await this.triageAgent.run(alert);

    yield {
      type: "step",
      step: step(
        "triage",
        "completed",
        "Triage complete",
        `Severity ${triage.severity.toUpperCase()} for ${triage.affectedService}.`,
        {
          severity: triage.severity,
          investigationWindowMinutes: triage.investigationWindowMinutes,
        },
      ),
    };

    yield {
      type: "step",
      step: step(
        "investigation",
        "running",
        "Investigation Agent started",
        "Querying Datadog and optional MiniMax analysis for last 30 minutes.",
      ),
    };

    const investigation = await this.investigationAgent.run(alert, triage);

    yield {
      type: "step",
      step: step(
        "investigation",
        "completed",
        "Investigation complete",
        `Collected ${investigation.datadog.topErrors.length} high-signal log entries from Datadog.`,
        {
          datadogMode: investigation.datadog.connectorMode,
          minimaxMode: investigation.minimax?.connectorMode ?? "skipped",
        },
      ),
    };

    yield {
      type: "step",
      step: step(
        "rca",
        "running",
        "RCA + Remediation Agent started",
        "Traversing Neo4j blast radius, matching MongoDB runbooks, synthesizing ranked hypotheses.",
      ),
    };

    const rca = await this.rcaAgent.run(alert, triage, investigation);

    yield {
      type: "step",
      step: step(
        "rca",
        "completed",
        "RCA synthesis complete",
        `Top hypothesis confidence ${(rca.confidence * 100).toFixed(0)}% with ${rca.blastRadius.length} impacted services.`,
        {
          confidence: rca.confidence,
          blastRadiusSize: rca.blastRadius.length,
        },
      ),
    };

    const report: InvestigationReport = {
      alert,
      triage,
      investigation,
      rca,
    };

    yield {
      type: "report",
      report,
    };
  }
}
