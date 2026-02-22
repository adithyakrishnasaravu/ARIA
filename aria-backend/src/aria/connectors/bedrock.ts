import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

import { ariaConfig, isConnectorLive } from "../config";
import { CrossServiceLog, Hypothesis, LogFinding, MetricPoint, Runbook } from "../types";

// ── Input / output types ──────────────────────────────────────────────────────

export interface BedrockRcaInput {
  // Alert snapshot
  service: string;
  summary: string;
  p99LatencyMs: number;
  errorRatePct: number;
  // Full log findings — includes stack traces, error kinds, trace IDs
  topErrors: LogFinding[];
  // Blast radius from Neo4j
  blastRadius: string[];
  // Historical runbooks from MongoDB Atlas
  runbooks: Runbook[];
  // Datadog enrichments
  tracesSummary: string;
  metricTrend?: string;
  spanSummary?: string[];
  errorRateSeries?: MetricPoint[];
  crossServiceLogs?: CrossServiceLog[];
}

interface BedrockRcaOutput {
  narrative: string;
  confidence: number;
  hypotheses: Hypothesis[];
  recommendedPlan: string[];
}

// ── Bedrock client singleton ──────────────────────────────────────────────────

let cachedClient: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({ region: ariaConfig.bedrock.region });
  }
  return cachedClient;
}

// ── Response parsing ──────────────────────────────────────────────────────────

function extractText(body: Uint8Array): string {
  const raw = JSON.parse(new TextDecoder().decode(body)) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return raw.content?.find((b) => b.type === "text")?.text ?? "";
}

function parseOutput(raw: string): BedrockRcaOutput | null {
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;

  try {
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as BedrockRcaOutput;
    if (
      !parsed.narrative ||
      !Array.isArray(parsed.hypotheses) ||
      !Array.isArray(parsed.recommendedPlan)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

const RCA_SYSTEM = `You are ARIA, a senior on-call SRE performing root-cause analysis for a production incident.

Your job is to synthesize ALL available signals — error logs, stack traces, error trends, distributed trace data, historical runbooks, and blast radius — into a ranked list of hypotheses with concrete remediation steps.

Rules:
- Rank hypotheses by probability (highest first).
- Each hypothesis must reference specific signals from the evidence (log messages, error kinds, stack frames, trends).
- Remediation steps must be actionable and specific — not generic ("check logs").
- If a historical runbook closely matches the incident pattern, reference it explicitly.
- If error trend is "rising", treat the incident as actively escalating.
- Cross-service logs indicate blast radius propagation — factor them into impact assessment.

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "narrative": "<2-3 sentences: what is happening and why, citing specific signals>",
  "confidence": <0.0–1.0>,
  "hypotheses": [
    {
      "title": "<specific hypothesis title — not generic>",
      "probability": <0.0–1.0>,
      "evidence": ["<specific signal from the data>", ...],
      "remediation": ["<concrete actionable step>", ...]
    }
  ],
  "recommendedPlan": ["<step 1>", "<step 2>", ...]
}`;

// ── Reasoner ──────────────────────────────────────────────────────────────────

export class BedrockReasoner {
  async synthesize(input: BedrockRcaInput): Promise<BedrockRcaOutput | null> {
    if (!isConnectorLive("bedrock")) return null;

    // Build a structured evidence package for the prompt
    const evidencePackage = {
      alertSnapshot: {
        service: input.service,
        summary: input.summary,
        p99LatencyMs: input.p99LatencyMs,
        errorRatePct: input.errorRatePct,
      },
      errorLogs: input.topErrors.map((e) => ({
        message: e.message,
        errorKind: e.errorKind ?? null,
        count: e.count ?? null,
        stackTrace: e.stackTrace ? e.stackTrace.split("\n").slice(0, 6).join("\n") : null,
        traceId: e.traceId ?? null,
      })),
      errorTrend: input.metricTrend
        ? {
            direction: input.metricTrend,
            seriesSummary:
              input.errorRateSeries && input.errorRateSeries.length > 0
                ? `${input.errorRateSeries.length} buckets, last value: ${input.errorRateSeries[input.errorRateSeries.length - 1]?.value ?? "?"}`
                : "no series data",
          }
        : null,
      traceCorrelation: {
        summary: input.tracesSummary,
        crossServiceErrors:
          input.crossServiceLogs?.slice(0, 8).map((l) => ({
            service: l.service,
            message: l.message,
          })) ?? [],
      },
      spanMetrics: input.spanSummary ?? [],
      blastRadius: input.blastRadius,
      matchedRunbooks: input.runbooks.map((r) => ({
        title: r.title,
        summary: r.summary,
        topSteps: r.steps.slice(0, 3),
        lastUsed: r.lastUsedAt,
      })),
    };

    const command = new InvokeModelCommand({
      modelId: ariaConfig.bedrock.modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1500,
        temperature: 0.1,
        system: RCA_SYSTEM,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: JSON.stringify(evidencePackage, null, 2) }],
          },
        ],
      }),
    });

    try {
      const response = await getClient().send(command);
      if (!response.body) return null;

      const text = extractText(response.body as Uint8Array);
      return parseOutput(text);
    } catch (error) {
      console.warn(
        "BedrockReasoner: synthesis failed —",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }
}
