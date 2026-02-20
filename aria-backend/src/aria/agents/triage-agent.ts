import { AlertPayload, Severity, TriageResult } from "../types";

function classifySeverity(alert: AlertPayload): Severity {
  if (alert.errorRatePct >= 10 || alert.p99LatencyMs >= 3000) {
    return "sev1";
  }

  if (alert.errorRatePct >= 5 || alert.p99LatencyMs >= 2000) {
    return "sev2";
  }

  return "sev3";
}

export class TriageAgent {
  async run(alert: AlertPayload): Promise<TriageResult> {
    const severity = classifySeverity(alert);

    const urgencyReason =
      severity === "sev1"
        ? "High customer impact: elevated errors and latency exceed critical thresholds."
        : severity === "sev2"
          ? "Moderate impact: performance degradation likely visible to users."
          : "Low impact: continue monitoring while investigation runs.";

    return {
      severity,
      affectedService: alert.service,
      urgencyReason,
      investigationWindowMinutes: 30,
    };
  }
}
