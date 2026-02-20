import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

import { ariaConfig, isConnectorLive } from "../config";
import { Hypothesis, Runbook } from "../types";

interface BedrockRcaInput {
  service: string;
  summary: string;
  p99LatencyMs: number;
  errorRatePct: number;
  topErrors: string[];
  blastRadius: string[];
  runbooks: Runbook[];
}

interface BedrockRcaOutput {
  narrative: string;
  confidence: number;
  hypotheses: Hypothesis[];
  recommendedPlan: string[];
}

let cachedClient: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({ region: ariaConfig.bedrock.region });
  }

  return cachedClient;
}

function extractText(body: Uint8Array): string {
  const raw = JSON.parse(new TextDecoder().decode(body)) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const textBlock = raw.content?.find((entry) => entry.type === "text");
  return textBlock?.text ?? "";
}

function parseOutput(raw: string): BedrockRcaOutput | null {
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");

  if (jsonStart < 0 || jsonEnd < 0 || jsonEnd <= jsonStart) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as BedrockRcaOutput;
    if (!parsed.narrative || !Array.isArray(parsed.hypotheses) || !Array.isArray(parsed.recommendedPlan)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export class BedrockReasoner {
  async synthesize(input: BedrockRcaInput): Promise<BedrockRcaOutput | null> {
    if (!isConnectorLive("bedrock")) {
      return null;
    }

    const prompt = [
      "You are ARIA, a production incident root-cause analyst.",
      "Return strict JSON with keys: narrative (string), confidence (number 0..1), hypotheses (array), recommendedPlan (array of strings).",
      "Each hypothesis must include: title, probability, evidence (string[]), remediation (string[]).",
      "Rank hypotheses by probability descending.",
      "Incident context:",
      JSON.stringify(input, null, 2),
    ].join("\n");

    const command = new InvokeModelCommand({
      modelId: ariaConfig.bedrock.modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1000,
        temperature: 0.1,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }],
          },
        ],
      }),
    });

    try {
      const response = await getClient().send(command);
      if (!response.body) {
        return null;
      }

      const text = extractText(response.body as Uint8Array);
      return parseOutput(text);
    } catch {
      return null;
    }
  }
}
