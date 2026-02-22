import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

import { ariaConfig, isConnectorLive } from "../config";
import { DatadogConnector } from "../connectors/datadog";
import { lookupService } from "../service-registry";
import { AlertPayload, InvestigationResult, LikelyCause, Severity, TriageResult } from "../types";

// ── Triage model — always Claude Sonnet 4.6 ──────────────────────────────────

const TRIAGE_MODEL_ID = "us.anthropic.claude-sonnet-4-6";

// ── Shared Bedrock client ─────────────────────────────────────────────────────

let cachedClient: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({ region: ariaConfig.bedrock.region });
  }
  return cachedClient;
}

// ── Operational context ───────────────────────────────────────────────────────

function buildOperationalContext(recentDeploys: string[]): Record<string, unknown> {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  // Peak window: roughly 13:00–21:00 UTC (9am–5pm ET)
  const isPeakTraffic = utcHour >= 13 && utcHour <= 21;

  return {
    utcHour,
    dayOfWeek,
    isPeakTraffic,
    activeDeployments: recentDeploys.length > 0 ? recentDeploys : "none detected",
  };
}

// ── Output parsing ────────────────────────────────────────────────────────────

function parseTriageJson(raw: string): TriageResult | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      severity?: string;
      affectedService?: string;
      urgencyReason?: string;
      investigationWindowMinutes?: number;
      confidence?: number;
      escalateImmediately?: boolean;
      likelyCause?: string;
      requiresHumanConfirmation?: boolean;
      dataQualityWarning?: string;
    };

    if (
      !parsed.severity ||
      !parsed.affectedService ||
      !parsed.urgencyReason ||
      !["sev0", "sev1", "sev2", "sev3"].includes(parsed.severity)
    ) {
      return null;
    }

    const validCauses: LikelyCause[] = ["recent_deploy", "dependency_failure", "load_spike", "unknown"];
    const likelyCause: LikelyCause = validCauses.includes(parsed.likelyCause as LikelyCause)
      ? (parsed.likelyCause as LikelyCause)
      : "unknown";

    const severity = parsed.severity as Severity;

    return {
      severity,
      affectedService: parsed.affectedService,
      urgencyReason: parsed.urgencyReason,
      investigationWindowMinutes: parsed.investigationWindowMinutes ?? 30,
      confidence: parsed.confidence ?? 0.7,
      escalateImmediately: parsed.escalateImmediately ?? severity === "sev1",
      likelyCause,
      requiresHumanConfirmation: severity === "sev1" ? true : (parsed.requiresHumanConfirmation ?? false),
      dataQualityWarning: parsed.dataQualityWarning ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── Rule fallback ─────────────────────────────────────────────────────────────

function ruleFallback(alert: AlertPayload): TriageResult {
  let severity: Severity;
  let urgencyReason: string;

  if (alert.errorRatePct >= 10 || alert.p99LatencyMs >= 3000) {
    severity = "sev1";
    urgencyReason = "High customer impact: elevated errors and latency exceed critical thresholds.";
  } else if (alert.errorRatePct >= 5 || alert.p99LatencyMs >= 2000) {
    severity = "sev2";
    urgencyReason = "Moderate impact: performance degradation likely visible to users.";
  } else {
    severity = "sev3";
    urgencyReason = "Low impact: continue monitoring while investigation runs.";
  }

  return {
    severity,
    affectedService: alert.service,
    urgencyReason,
    investigationWindowMinutes: 30,
    confidence: 0.6,
    escalateImmediately: severity === "sev1",
    likelyCause: "unknown",
    requiresHumanConfirmation: severity === "sev1",
    dataQualityWarning: "Bedrock unavailable — severity derived from static thresholds only.",
  };
}

// ── Bedrock call ──────────────────────────────────────────────────────────────

async function callBedrock(systemPrompt: string, userMessage: string): Promise<string> {
  const command = new InvokeModelCommand({
    modelId: TRIAGE_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 512,
      temperature: 0.0,
      system: systemPrompt,
      messages: [{ role: "user", content: [{ type: "text", text: userMessage }] }],
    }),
  });

  const response = await getClient().send(command);
  const decoded = JSON.parse(new TextDecoder().decode(response.body as Uint8Array)) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return decoded.content?.find((b) => b.type === "text")?.text ?? "";
}

// ── Phase 1 system prompt ─────────────────────────────────────────────────────

const PHASE1_SYSTEM = `You are ARIA's senior triage engineer. Assess the production incident and classify severity based on business impact and operational context — not just raw metric thresholds.

You have access to:
- Alert metrics and summary
- Service profile (criticality tier, SLA, revenue impact per minute, downstream service count)
- Operational context (time of day, traffic window, active deployments)

Key reasoning principles:
- A T1 service during peak traffic with an active deploy in the last 30 minutes should escalate even at moderate metrics
- An unregistered or T3 service at the same metrics warrants less urgency
- Low data quality (< 5 minutes of signal, contradictory metrics) should be flagged
- "recent_deploy" is the most common root cause — weight it heavily if deployments are active

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "severity": "sev1" | "sev2" | "sev3",
  "affectedService": "<service name>",
  "urgencyReason": "<2-3 sentences referencing specific signals from the context, not just metrics>",
  "investigationWindowMinutes": <15–60>,
  "confidence": <0.0–1.0>,
  "escalateImmediately": <true|false>,
  "likelyCause": "recent_deploy" | "dependency_failure" | "load_spike" | "unknown",
  "requiresHumanConfirmation": <true if sev1, else false>,
  "dataQualityWarning": "<string if signals are incomplete or contradictory, omit otherwise>"
}`;

// ── Phase 2 system prompt ─────────────────────────────────────────────────────

const PHASE2_SYSTEM = `You are ARIA's senior triage engineer performing a re-triage with Datadog evidence.

Phase 1 produced an initial severity classification. You now have real error log evidence from Datadog.
Refine the severity if the evidence changes the picture. You may escalate severity but should not de-escalate without explicit justification in urgencyReason.

Respond ONLY with valid JSON using the exact same schema as Phase 1:
{
  "severity": "sev1" | "sev2" | "sev3",
  "affectedService": "<service name>",
  "urgencyReason": "<updated reasoning incorporating Datadog evidence>",
  "investigationWindowMinutes": <15–60>,
  "confidence": <0.0–1.0>,
  "escalateImmediately": <true|false>,
  "likelyCause": "recent_deploy" | "dependency_failure" | "load_spike" | "unknown",
  "requiresHumanConfirmation": <true if sev1, else false>,
  "dataQualityWarning": "<string if applicable, omit otherwise>"
}`;

// ── Agent ─────────────────────────────────────────────────────────────────────

export class TriageAgent {
  constructor(private readonly datadog = new DatadogConnector()) {}

  /** Phase 1 — fast triage from alert snapshot + service registry + operational context. */
  async run(alert: AlertPayload): Promise<TriageResult> {
    const [recentDeploys, serviceProfile] = await Promise.all([
      this.datadog.fetchRecentDeploys(alert.service, 30),
      Promise.resolve(lookupService(alert.service)),
    ]);

    const operationalContext = buildOperationalContext(recentDeploys);

    if (isConnectorLive("bedrock")) {
      try {
        const userMessage = JSON.stringify(
          {
            alert,
            serviceProfile,
            operationalContext,
          },
          null,
          2,
        );

        const raw = await callBedrock(PHASE1_SYSTEM, userMessage);
        const result = parseTriageJson(raw);
        if (result) return result;
      } catch (error) {
        console.warn(
          "TriageAgent Phase 1: Bedrock failed, using rule fallback —",
          error instanceof Error ? error.message : error,
        );
      }
    }

    return ruleFallback(alert);
  }

  /** Phase 2 — re-triage with Datadog evidence to refine Phase 1 classification. */
  async refine(
    alert: AlertPayload,
    phase1: TriageResult,
    investigation: InvestigationResult,
  ): Promise<TriageResult> {
    if (!isConnectorLive("bedrock")) return phase1;

    try {
      const topErrors = investigation.datadog.topErrors.slice(0, 5).map((e) => e.message);
      const userMessage = JSON.stringify(
        {
          phase1Result: phase1,
          datadogEvidence: {
            windowStart: investigation.datadog.windowStart,
            windowEnd: investigation.datadog.windowEnd,
            topErrors,
            metricsSummary: investigation.datadog.metricsSummary,
            notes: investigation.datadog.notes,
          },
          alert: {
            service: alert.service,
            summary: alert.summary,
            p99LatencyMs: alert.p99LatencyMs,
            errorRatePct: alert.errorRatePct,
          },
        },
        null,
        2,
      );

      const raw = await callBedrock(PHASE2_SYSTEM, userMessage);
      const result = parseTriageJson(raw);
      if (result) return result;
    } catch (error) {
      console.warn(
        "TriageAgent Phase 2: Bedrock failed, keeping Phase 1 result —",
        error instanceof Error ? error.message : error,
      );
    }

    return phase1;
  }
}
