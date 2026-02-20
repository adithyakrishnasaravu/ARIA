"use client";

import { useMemo, useState } from "react";
import { CopilotChat } from "@copilotkit/react-ui";

import { InvestigationReport, StreamEvent, TimelineStep } from "@/lib/types";

type FormState = {
  incidentId: string;
  service: string;
  summary: string;
  p99LatencyMs: number;
  errorRatePct: number;
  startedAt: string;
  screenshotBase64?: string;
};

const defaultForm: FormState = {
  incidentId: "inc-2026-02-20-payment-latency",
  service: "payment-svc",
  summary: "Payment service p99 latency at 4.2s and error rate at 12%",
  p99LatencyMs: 4200,
  errorRatePct: 12,
  startedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
};

function toIsoLocal(value: string): string {
  const date = new Date(value);
  const tzOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function fromLocalToIso(value: string): string {
  return new Date(value).toISOString();
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:${file.type};base64,${btoa(binary)}`;
}

function SeverityBadge({ severity }: { severity: string }) {
  const tone =
    severity === "sev1"
      ? "bg-red-500/20 text-red-200 ring-red-300/30"
      : severity === "sev2"
        ? "bg-amber-400/20 text-amber-100 ring-amber-300/30"
        : "bg-emerald-500/20 text-emerald-100 ring-emerald-300/30";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase ring-1 ${tone}`}>
      {severity}
    </span>
  );
}

function StepRow({ step }: { step: TimelineStep }) {
  const statusTone =
    step.status === "running"
      ? "border-cyan-300/30 bg-cyan-500/10"
      : step.status === "failed"
        ? "border-rose-300/30 bg-rose-500/10"
        : "border-emerald-300/30 bg-emerald-500/10";

  return (
    <li className={`rounded-xl border p-3 ${statusTone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-100">{step.title}</p>
        <span className="text-[11px] uppercase tracking-[0.16em] text-slate-300">{step.agent}</span>
      </div>
      <p className="mt-1 text-sm text-slate-300">{step.detail}</p>
      <p className="mt-2 text-[11px] text-slate-400">
        {new Date(step.timestamp).toLocaleTimeString()}
      </p>
    </li>
  );
}

export function AriaConsole() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_ARIA_API_BASE_URL ?? "http://localhost:4000";

  const [form, setForm] = useState<FormState>(defaultForm);
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topHypothesis = report?.rca.hypotheses[0] ?? null;

  const serviceCount = useMemo(() => report?.rca.blastRadius.length ?? 0, [report]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRunning(true);
    setSteps([]);
    setReport(null);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/incidents/investigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok || !response.body) {
        const fallback = await response.json().catch(() => ({}));
        throw new Error(fallback.error ?? `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop() ?? "";

        for (const message of messages) {
          const dataLine = message
            .split("\n")
            .find((line) => line.startsWith("data: "));

          if (!dataLine) {
            continue;
          }

          const eventPayload = JSON.parse(dataLine.slice(6)) as StreamEvent;

          if (eventPayload.type === "step") {
            setSteps((current) => [...current, eventPayload.step]);
          }

          if (eventPayload.type === "report") {
            setReport(eventPayload.report);
          }

          if (eventPayload.type === "error") {
            setError(eventPayload.message);
          }
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unknown submit error.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 py-8 md:px-8 lg:py-10">
      <header className="rounded-2xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_20px_45px_-28px_rgba(20,208,255,0.55)] backdrop-blur">
        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-200/90">Autonomous Root-cause Intelligence Agent</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">ARIA Incident Command Console</h1>
        <p className="mt-3 max-w-4xl text-sm text-slate-300">
          Triage, investigation, blast radius analysis, and remediation planning in one live workflow.
          Datadog + Neo4j + MongoDB + Bedrock with CopilotKit in the loop.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">Incident Input</h2>
          <form onSubmit={onSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-200">
              Incident ID
              <input
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-cyan-300/60 focus:ring"
                value={form.incidentId}
                onChange={(e) => setForm((prev) => ({ ...prev, incidentId: e.target.value }))}
                required
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-200">
              Service
              <input
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-cyan-300/60 focus:ring"
                value={form.service}
                onChange={(e) => setForm((prev) => ({ ...prev, service: e.target.value }))}
                required
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-200 md:col-span-2">
              Alert Summary
              <input
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-cyan-300/60 focus:ring"
                value={form.summary}
                onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                required
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-200">
              p99 Latency (ms)
              <input
                type="number"
                min={0}
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-cyan-300/60 focus:ring"
                value={form.p99LatencyMs}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, p99LatencyMs: Number(e.target.value) }))
                }
                required
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-200">
              Error Rate (%)
              <input
                type="number"
                step="0.1"
                min={0}
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-cyan-300/60 focus:ring"
                value={form.errorRatePct}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, errorRatePct: Number(e.target.value) }))
                }
                required
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-200">
              Incident Start
              <input
                type="datetime-local"
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-slate-100 outline-none ring-cyan-300/60 focus:ring"
                value={toIsoLocal(form.startedAt)}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, startedAt: fromLocalToIso(e.target.value) }))
                }
                required
              />
            </label>

            <label className="grid gap-1 text-sm text-slate-200">
              Dashboard Screenshot (optional)
              <input
                type="file"
                accept="image/*"
                className="rounded-lg border border-dashed border-white/20 bg-slate-900 px-3 py-2 text-xs text-slate-300"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    setForm((prev) => ({ ...prev, screenshotBase64: undefined }));
                    return;
                  }
                  const screenshotBase64 = await fileToBase64(file);
                  setForm((prev) => ({ ...prev, screenshotBase64 }));
                }}
              />
            </label>

            <button
              type="submit"
              disabled={running}
              className="md:col-span-2 rounded-lg bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? "ARIA Investigating..." : "Run Autonomous Investigation"}
            </button>
          </form>

          {error ? (
            <p className="mt-4 rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <div className="mt-6 grid gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">Live Timeline</h3>
            <ul className="grid gap-2">
              {steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
              {!steps.length && !running ? (
                <li className="rounded-xl border border-white/10 bg-slate-900/70 p-3 text-sm text-slate-400">
                  Waiting for investigation run.
                </li>
              ) : null}
            </ul>
          </div>
        </section>

        <section className="grid gap-6">
          <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">Ranked Root Cause</h2>
            {!report ? (
              <p className="mt-3 text-sm text-slate-400">Run an incident to generate the RCA package.</p>
            ) : (
              <div className="mt-3 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={report.triage.severity} />
                  <span className="rounded-full bg-cyan-400/20 px-3 py-1 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-200/30">
                    Confidence {(report.rca.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="rounded-full bg-indigo-400/20 px-3 py-1 text-xs font-semibold text-indigo-100 ring-1 ring-indigo-200/30">
                    Blast Radius {serviceCount} services
                  </span>
                </div>

                <p className="text-sm text-slate-200">{report.rca.narrative}</p>

                {topHypothesis ? (
                  <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-3">
                    <p className="text-sm font-semibold text-emerald-100">{topHypothesis.title}</p>
                    <p className="mt-1 text-xs text-emerald-100/80">
                      Probability {(topHypothesis.probability * 100).toFixed(0)}%
                    </p>
                    <ul className="mt-2 grid gap-1 text-xs text-emerald-50/90">
                      {topHypothesis.evidence.slice(0, 3).map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Recommended Plan</h3>
                  <ol className="mt-2 grid gap-1 text-sm text-slate-300">
                    {report.rca.recommendedPlan.map((action, index) => (
                      <li key={`${index}-${action}`}>{index + 1}. {action}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">ARIA Copilot (CopilotKit)</h2>
            <p className="mt-1 text-xs text-slate-400">
              Ask for remediation sequencing, rollback strategy, or impact communication.
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-slate-900/80">
              <CopilotChat
                className="h-[420px]"
                instructions="You are ARIA, an incident-response copilot. Use concise runbook-oriented answers. If an incident report exists in context, prioritize that evidence and state confidence."
                suggestions={[
                  { label: "Summarize root cause", message: "Summarize the likely root cause and why." },
                  { label: "Prepare mitigation plan", message: "Create a 15-minute mitigation execution checklist." },
                  { label: "Draft stakeholder update", message: "Draft a status update for product and support teams." },
                ]}
              />
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
