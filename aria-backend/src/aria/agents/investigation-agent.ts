import { DatadogConnector } from "../connectors/datadog";
import { MiniMaxConnector } from "../connectors/minimax";
import { AlertPayload, InvestigationResult, TriageResult } from "../types";

export class InvestigationAgent {
  constructor(
    private readonly datadog = new DatadogConnector(),
    private readonly minimax = new MiniMaxConnector(),
  ) {}

  async run(alert: AlertPayload, triage: TriageResult): Promise<InvestigationResult> {
    const [datadogEvidence, minimaxEvidence] = await Promise.all([
      this.datadog.fetchEvidence(alert, triage.investigationWindowMinutes),
      this.minimax.analyzeScreenshot(alert.screenshotBase64),
    ]);

    return {
      datadog: datadogEvidence,
      minimax: minimaxEvidence,
    };
  }
}
