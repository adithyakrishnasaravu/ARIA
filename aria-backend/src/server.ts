import "dotenv/config";

import cors from "cors";
import express, {
  NextFunction,
  Request,
  Response as ExpressResponse,
} from "express";
import {
  EmptyAdapter,
  CopilotRuntime,
  copilotRuntimeNodeHttpEndpoint,
} from "@copilotkit/runtime";
import { z } from "zod";

import { AriaOrchestrator } from "./aria/orchestrator";
import { AriaCopilotAgent } from "./aria/agents/copilot-agent";
import { demoAlert } from "./aria/mock-data";
import { AlertPayload, InvestigationReport } from "./aria/types";
import { IncidentStore } from "./aria/connectors/mongodb";

const app = express();
const port = Number(process.env.ARIA_BACKEND_PORT ?? 4000);
const authHeaderName = "x-aria-api-key";

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const configuredApiKeys = (
  process.env.ARIA_API_KEYS ?? process.env.ARIA_API_KEY ?? ""
)
  .split(",")
  .map((apiKey) => apiKey.trim())
  .filter(Boolean);
const authEnabled = configuredApiKeys.length > 0;
const rateLimitWindowMs = Math.max(
  1_000,
  Number(process.env.ARIA_RATE_LIMIT_WINDOW_MS ?? 60_000),
);
const rateLimitMaxRequests = Math.max(
  1,
  Number(process.env.ARIA_RATE_LIMIT_MAX_REQUESTS ?? 30),
);
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "6mb" }));

function extractClientIp(req: Request): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return req.ip || req.socket.remoteAddress || "unknown";
}

function readApiKeyFromRequest(req: Request): string | null {
  const directHeader = req.header(authHeaderName);
  if (directHeader) {
    return directHeader.trim();
  }

  const authorization = req.header("authorization");
  if (!authorization) {
    return null;
  }

  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return authorization.trim();
}

function requireApiKey(req: Request, res: ExpressResponse, next: NextFunction): void {
  if (!authEnabled) {
    next();
    return;
  }

  const providedApiKey = readApiKeyFromRequest(req);
  if (providedApiKey && configuredApiKeys.includes(providedApiKey)) {
    next();
    return;
  }

  res.status(401).json({
    error:
      "Unauthorized. Include a valid API key via x-aria-api-key header or Authorization: Bearer <key>.",
  });
}

function applyRateLimit(req: Request, res: ExpressResponse, next: NextFunction): void {
  const key = extractClientIp(req);
  const now = Date.now();
  const existing = rateLimitBuckets.get(key);

  if (!existing || now >= existing.resetAt) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + rateLimitWindowMs,
    });
    res.setHeader("X-RateLimit-Limit", String(rateLimitMaxRequests));
    res.setHeader("X-RateLimit-Remaining", String(rateLimitMaxRequests - 1));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil((now + rateLimitWindowMs) / 1000)));
    next();
    return;
  }

  if (existing.count >= rateLimitMaxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: "Too many requests. Please retry after the rate limit window resets.",
    });
    return;
  }

  existing.count += 1;
  rateLimitBuckets.set(key, existing);
  res.setHeader("X-RateLimit-Limit", String(rateLimitMaxRequests));
  res.setHeader("X-RateLimit-Remaining", String(rateLimitMaxRequests - existing.count));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(existing.resetAt / 1000)));

  if (rateLimitBuckets.size > 10_000) {
    for (const [bucketKey, bucket] of rateLimitBuckets.entries()) {
      if (now >= bucket.resetAt) {
        rateLimitBuckets.delete(bucketKey);
      }
    }
  }

  next();
}

app.use(["/incidents/investigate", "/copilotkit"], requireApiKey, applyRateLimit);

const alertSchema = z.object({
  incidentId: z.string().min(1),
  service: z.string().min(1),
  summary: z.string().min(1),
  p99LatencyMs: z.number().nonnegative(),
  errorRatePct: z.number().nonnegative(),
  startedAt: z.string().datetime(),
  screenshotBase64: z.string().optional(),
});

const orchestrator = new AriaOrchestrator();
const incidentStore = new IncidentStore();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "aria-backend" });
});

app.get("/", (_req, res) => {
  res.json({
    service: "aria-backend",
    status: "ok",
    endpoints: ["/health", "/incidents", "/incidents/investigate", "/copilotkit"],
  });
});

app.post("/chat", async (req: Request, res: ExpressResponse) => {
  const { messages = [], threadId = crypto.randomUUID(), runId = crypto.randomUUID() } = req.body as {
    messages?: Array<{ role: string; content: string }>;
    threadId?: string;
    runId?: string;
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  const msgId = crypto.randomUUID();
  send({ type: "RUN_STARTED", threadId, runId });

  try {
    const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    const modelId = (process.env.COPILOTKIT_BEDROCK_MODEL ?? process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-4-6")
      .replace(/^bedrock\//i, "").trim();

    const bedrockMessages = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: [{ text: m.content }] }))
      .slice(-10);

    if (bedrockMessages.length === 0) {
      send({ type: "TEXT_MESSAGE_START", messageId: msgId, role: "assistant" });
      send({ type: "TEXT_MESSAGE_CONTENT", messageId: msgId, delta: "Share the incident details and I'll help with root cause analysis." });
      send({ type: "TEXT_MESSAGE_END", messageId: msgId });
    } else {
      const response = await client.send(new ConverseCommand({
        modelId,
        system: [{ text: "You are ARIA Copilot, an incident-response assistant. Be concise, practical, and runbook-oriented." }],
        messages: bedrockMessages,
        inferenceConfig: { maxTokens: 600, temperature: 0.2 },
      }));
      const text = (response.output as { message?: { content?: Array<{ text?: string }> } })
        ?.message?.content?.[0]?.text ?? "No response from model.";
      send({ type: "TEXT_MESSAGE_START", messageId: msgId, role: "assistant" });
      send({ type: "TEXT_MESSAGE_CONTENT", messageId: msgId, delta: text });
      send({ type: "TEXT_MESSAGE_END", messageId: msgId });
    }
  } catch (err) {
    send({ type: "TEXT_MESSAGE_START", messageId: msgId, role: "assistant" });
    send({ type: "TEXT_MESSAGE_CONTENT", messageId: msgId, delta: `Bedrock error: ${err instanceof Error ? err.message : "unknown"}` });
    send({ type: "TEXT_MESSAGE_END", messageId: msgId });
  }

  send({ type: "RUN_FINISHED", threadId, runId });
  res.end();
});

app.get("/incidents", async (_req: Request, res: ExpressResponse) => {
  const incidents = await incidentStore.list();
  res.json(incidents);
});

app.post("/incidents/investigate", async (req: Request, res: ExpressResponse) => {
  const parsed = alertSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error:
        "Invalid alert payload. Provide incidentId, service, summary, p99LatencyMs, errorRatePct, and startedAt.",
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    for await (const event of orchestrator.run(parsed.data)) {
      sendEvent(event);
      if (event.type === "report") {
        incidentStore.save(event.report).catch((err) =>
          console.warn("IncidentStore: background save failed —", err instanceof Error ? err.message : err),
        );
      }
    }
  } catch (error) {
    sendEvent({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Incident investigation failed unexpectedly.",
    });
  } finally {
    res.end();
  }
});

const copilotRuntime = new CopilotRuntime({
  agents: {
    // Runtime currently resolves AbstractAgent from a nested dependency tree.
    // Cast to avoid type incompatibility between duplicate @ag-ui/client copies.
    default: new AriaCopilotAgent() as unknown as never,
  },
  actions: [
    {
      name: "investigate_incident",
      description:
        "Run ARIA triage->investigation->RCA workflow for an incident payload and return the final report.",
      parameters: [
        {
          name: "incident",
          type: "object",
          required: false,
          attributes: [
            { name: "incidentId", type: "string", required: false },
            { name: "service", type: "string", required: false },
            { name: "summary", type: "string", required: false },
            { name: "p99LatencyMs", type: "number", required: false },
            { name: "errorRatePct", type: "number", required: false },
            { name: "startedAt", type: "string", required: false },
          ],
        },
      ],
      handler: async (args: { incident?: Partial<AlertPayload> }) => {
        const incident: AlertPayload = {
          ...demoAlert,
          ...args.incident,
          incidentId: args.incident?.incidentId ?? demoAlert.incidentId,
          service: args.incident?.service ?? demoAlert.service,
          summary: args.incident?.summary ?? demoAlert.summary,
          p99LatencyMs: args.incident?.p99LatencyMs ?? demoAlert.p99LatencyMs,
          errorRatePct: args.incident?.errorRatePct ?? demoAlert.errorRatePct,
          startedAt: args.incident?.startedAt ?? demoAlert.startedAt,
        };

        let report: InvestigationReport | null = null;
        for await (const event of orchestrator.run(incident)) {
          if (event.type === "report") {
            report = event.report;
          }
        }

        return report;
      },
    },
  ],
});

const copilotHandler = copilotRuntimeNodeHttpEndpoint({
  runtime: copilotRuntime,
  serviceAdapter: new EmptyAdapter(),
  // Express strips the mount prefix from req.url; endpoint must be "/" here.
  endpoint: "/",
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

async function forwardLegacyCopilotMethod(
  method: "info" | "agent/run" | "agent/connect" | "agent/stop",
  params: Record<string, string>,
  body: unknown,
): Promise<globalThis.Response> {
  const request = new globalThis.Request(`http://localhost:${port}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      method,
      params,
      body: body ?? {},
    }),
  });

  return (await copilotHandler(request)) as unknown as globalThis.Response;
}

async function writeFetchResponseToExpress(
  fetchResponse: globalThis.Response,
  res: ExpressResponse,
): Promise<void> {
  res.status(fetchResponse.status);
  fetchResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-length") {
      res.setHeader(key, value);
    }
  });
  res.send(await fetchResponse.text());
}

// Legacy CopilotKit compatibility routes used by older runtime clients.
app.all("/copilotkit/info", async (req, res) => {
  const response = await forwardLegacyCopilotMethod("info", {}, req.body);
  await writeFetchResponseToExpress(response, res);
});

app.post("/copilotkit/agent/:agentId/run", async (req, res) => {
  const response = await forwardLegacyCopilotMethod(
    "agent/run",
    { agentId: req.params.agentId },
    req.body,
  );
  await writeFetchResponseToExpress(response, res);
});

app.post("/copilotkit/agent/:agentId/connect", async (req, res) => {
  const response = await forwardLegacyCopilotMethod(
    "agent/connect",
    { agentId: req.params.agentId },
    req.body,
  );
  await writeFetchResponseToExpress(response, res);
});

app.post("/copilotkit/agent/:agentId/stop/:threadId", async (req, res) => {
  const response = await forwardLegacyCopilotMethod(
    "agent/stop",
    { agentId: req.params.agentId, threadId: req.params.threadId },
    req.body,
  );
  await writeFetchResponseToExpress(response, res);
});

app.use("/copilotkit", async (req, res) => {
  await copilotHandler(req, res);
});

app.listen(port, () => {
  console.log(`ARIA backend running on http://localhost:${port}`);
  if (!authEnabled) {
    console.warn(
      `Auth disabled. Set ARIA_API_KEYS in environment to require ${authHeaderName} for protected endpoints.`,
    );
  }
  console.log(
    `Rate limiting enabled: ${rateLimitMaxRequests} requests / ${rateLimitWindowMs}ms per client IP.`,
  );
});
