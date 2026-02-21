import crypto from "node:crypto";

import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { AbstractAgent, BaseEvent, EventType, Message, RunAgentInput } from "@ag-ui/client";
import { Observable } from "rxjs";

const SYSTEM_PROMPT = [
  "You are ARIA Copilot, an incident-response assistant.",
  "Be concise, practical, and runbook-oriented.",
  "When asked for rollback strategy, give clear, ordered steps, risk checks, and communication guidance.",
].join(" ");

function normalizeBedrockModelId(modelId: string): string {
  return modelId.replace(/^bedrock\//i, "").trim();
}

function resolveClaudeModelId(): string {
  const configured = normalizeBedrockModelId(
    process.env.COPILOTKIT_BEDROCK_MODEL ??
      process.env.BEDROCK_MODEL_ID ??
      "anthropic.claude-3-5-haiku-20241022-v1:0",
  );

  return configured;
}

function extractTextFromMessageContent(content: Message["content"]): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        (part as { type?: string }).type === "text" &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text.trim();
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function getLatestUserPrompt(messages: Message[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (!candidate || candidate.role !== "user") {
      continue;
    }

    const text = extractTextFromMessageContent(candidate.content);
    if (text) {
      return text;
    }
  }

  return "";
}

function convertToBedrockMessages(messages: Message[]): Array<{ role: "user" | "assistant"; content: Array<{ text: string }> }> {
  const converted: Array<{ role: "user" | "assistant"; content: Array<{ text: string }> }> = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }

    const text = extractTextFromMessageContent(message.content);
    if (!text) {
      continue;
    }

    converted.push({
      role: message.role,
      content: [{ text }],
    });
  }

  return converted.slice(-10);
}

function extractConverseText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const output = (response as { output?: unknown }).output;
  if (!output || typeof output !== "object" || !("message" in output)) {
    return "";
  }

  const message = (output as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (block && typeof block === "object" && "text" in block) {
        const text = (block as { text?: unknown }).text;
        return typeof text === "string" ? text.trim() : "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export class AriaCopilotAgent extends AbstractAgent {
  private readonly bedrockClient: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor() {
    super();
    this.modelId = resolveClaudeModelId();
    this.bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
  }

  private async generateResponse(input: RunAgentInput): Promise<string> {
    const prompt = getLatestUserPrompt(input.messages);
    if (!prompt) {
      return "Share the incident question you want help with, and I will generate a runbook-style response.";
    }

    if (!this.modelId.toLowerCase().includes("claude")) {
      return `Model configuration error: BEDROCK_MODEL_ID must be a Claude model, got "${this.modelId}".`;
    }

    try {
      const response = await this.bedrockClient.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: SYSTEM_PROMPT }],
          messages: convertToBedrockMessages(input.messages),
          inferenceConfig: {
            maxTokens: 600,
            temperature: 0.2,
            topP: 0.9,
          },
        }),
      );

      const text = extractConverseText(response);
      if (text) {
        return text;
      }

      return "Claude returned an empty response. Please retry.";
    } catch (error) {
      console.error(
        "ARIA Copilot Bedrock error:",
        error instanceof Error ? error.message : error,
      );

      return `Claude unavailable on Bedrock: ${
        error instanceof Error ? error.message : "unknown runtime error"
      }`;
    }
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const messageId = crypto.randomUUID();

      subscriber.next({
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      });

      void (async () => {
        const text = await this.generateResponse(input);

        subscriber.next({
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: "assistant",
        });

        subscriber.next({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: text,
        });

        subscriber.next({
          type: EventType.TEXT_MESSAGE_END,
          messageId,
        });

        subscriber.next({
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
          result: { messageId },
        });

        subscriber.complete();
      })().catch((error) => {
        subscriber.next({
          type: EventType.RUN_ERROR,
          message:
            error instanceof Error
              ? error.message
              : "Copilot chat failed unexpectedly.",
        });
        subscriber.error(error);
      });
    });
  }
}
