import "dotenv/config";

import cors from "cors";
import express, { Request, Response as ExpressResponse } from "express";
import {
  BedrockAdapter,
  CopilotRuntime,
  copilotRuntimeNodeHttpEndpoint,
} from "@copilotkit/runtime";
import { z } from "zod";

import { AriaOrchestrator } from "./aria/orchestrator";
import { demoAlert } from "./aria/mock-data";
import { AlertPayload, InvestigationReport } from "./aria/types";

const app = express();
const port = Number(process.env.ARIA_BACKEND_PORT ?? 4000);

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "6mb" }));

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

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "aria-backend" });
});

app.get("/", (_req, res) => {
  res.json({
    service: "aria-backend",
    status: "ok",
    endpoints: ["/health", "/incidents/investigate", "/copilotkit"],
  });
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

const copilotServiceAdapter = new BedrockAdapter({
  model:
    process.env.COPILOTKIT_BEDROCK_MODEL ??
    process.env.BEDROCK_MODEL_ID ??
    "anthropic.claude-3-5-sonnet-20240620-v1:0",
  region: process.env.AWS_REGION ?? "us-east-1",
});

const copilotHandler = copilotRuntimeNodeHttpEndpoint({
  runtime: copilotRuntime,
  serviceAdapter: copilotServiceAdapter,
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
});
