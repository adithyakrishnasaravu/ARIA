"use client";

import { useMemo, useRef, useState } from "react";

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
      ? "bg-rose-500/14 text-rose-200 ring-rose-300/30"
      : severity === "sev2"
        ? "bg-amber-500/14 text-amber-100 ring-amber-300/30"
        : "bg-emerald-500/14 text-emerald-100 ring-emerald-300/30";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1 ${tone}`}
    >
      {severity}
    </span>
  );
}

function StepRow({ step }: { step: TimelineStep }) {
  const statusTone =
    step.status === "running"
      ? "border-cyan-300/30 bg-cyan-500/10"
      : step.status === "failed"
        ? "border-rose-300/35 bg-rose-500/10"
        : "border-emerald-300/30 bg-emerald-500/10";

  return (
    <li className={`rounded-xl border p-3.5 ${statusTone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-100">{step.title}</p>
        <span className="rounded-full bg-white/8 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">
          {step.agent}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-slate-300">{step.detail}</p>
      <p className="mt-2 text-[11px] text-slate-400">
        {new Date(step.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </p>
    </li>
  );
}

type ChatMessage = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "Summarize the likely root cause and why.",
  "Create a 15-minute mitigation execution checklist.",
  "Draft a status update for product and support teams.",
];

function AriaCopilotChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const runtimeUrl = "/api/chat";

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const userMsg: ChatMessage = { role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.text }));
    const threadId = crypto.randomUUID();

    try {
      const res = await fetch(runtimeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, threadId, runId: crypto.randomUUID() }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      setMessages((m) => [...m, { role: "assistant", text: "" }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "TEXT_MESSAGE_CONTENT" && evt.delta) {
              assistantText += evt.delta;
              setMessages((m) => {
                const updated = [...m];
                updated[updated.length - 1] = { role: "assistant", text: assistantText };
                return updated;
              });
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch {}
        }
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Error: ${e instanceof Error ? e.message : "unknown"}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-300/20 bg-slate-950/75 flex flex-col h-[430px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Suggested prompts:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full text-left rounded-xl border border-slate-300/15 bg-white/4 px-3 py-2 text-xs text-slate-300 hover:bg-white/8 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-cyan-500/20 text-cyan-50"
                : "bg-white/6 text-slate-200"
            }`}>
              {m.text || <span className="animate-pulse text-slate-500">…</span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex gap-2 border-t border-slate-300/15 p-3"
      >
        <input
          className="flex-1 rounded-xl bg-white/6 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-cyan-400/40"
          placeholder="Ask ARIA about this incident…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-40 transition-colors"
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}

export function AriaConsole() {
  const investigateEndpoint = "/api/incidents/investigate";

  const [form, setForm] = useState<FormState>(defaultForm);
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topHypothesis = report?.rca.hypotheses[0] ?? null;

  const serviceCount = useMemo(() => report?.rca.blastRadius.length ?? 0, [report]);
  const completedSteps = useMemo(
    () => steps.filter((step) => step.status === "completed").length,
    [steps],
  );
  const connectorMode = report?.investigation.datadog.connectorMode ?? "pending";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRunning(true);
    setSteps([]);
    setReport(null);
    setError(null);

    try {
      const response = await fetch(investigateEndpoint, {
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
            await new Promise((r) => setTimeout(r, 1000));
            setSteps((current) => [...current, eventPayload.step]);
          }

          if (eventPayload.type === "report") {
            await new Promise((r) => setTimeout(r, 1000));
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
    <main className="relative min-h-screen overflow-hidden px-4 py-8 md:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6">
        <header
          className="panel glow-cyan animate-rise rounded-3xl p-6 md:p-8"
          style={{ animationDelay: "40ms" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-emerald-100">
              <span className="status-dot" />
              Command Console Online
            </span>
            <span className="rounded-full border border-slate-400/25 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-300">
              Datadog + Neo4j + Bedrock
            </span>
            <span className="rounded-full border border-slate-400/25 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-300">
              Data Mode {connectorMode}
            </span>
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-5xl">
            ARIA Incident Command
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300 md:text-base">
            Real-time triage, evidence collection, blast-radius analysis, and remediation synthesis
            in one unified black-glass workflow.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="panel-soft rounded-2xl p-3.5">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Workflow</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{completedSteps}/3 stages complete</p>
            </div>
            <div className="panel-soft rounded-2xl p-3.5">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Confidence</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">
                {report ? `${(report.rca.confidence * 100).toFixed(0)}%` : "--"}
              </p>
            </div>
            <div className="panel-soft rounded-2xl p-3.5">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Blast Radius</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{report ? `${serviceCount} services` : "--"}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.24fr_1fr]">
          <section
            className="panel animate-rise rounded-3xl p-5 md:p-6"
            style={{ animationDelay: "110ms" }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">Incident Input</h2>
              <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.13em] text-cyan-100">
                Live Stream
              </span>
            </div>

            <form onSubmit={onSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm text-slate-200">
                Incident ID
                <input
                  className="field-input rounded-xl px-3 py-2.5 text-slate-100"
                  value={form.incidentId}
                  onChange={(e) => setForm((prev) => ({ ...prev, incidentId: e.target.value }))}
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm text-slate-200">
                Service
                <input
                  className="field-input rounded-xl px-3 py-2.5 text-slate-100"
                  value={form.service}
                  onChange={(e) => setForm((prev) => ({ ...prev, service: e.target.value }))}
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm text-slate-200 md:col-span-2">
                Alert Summary
                <input
                  className="field-input rounded-xl px-3 py-2.5 text-slate-100"
                  value={form.summary}
                  onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm text-slate-200">
                p99 Latency (ms)
                <input
                  type="number"
                  min={0}
                  className="field-input rounded-xl px-3 py-2.5 text-slate-100"
                  value={form.p99LatencyMs}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, p99LatencyMs: Number(e.target.value) }))
                  }
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm text-slate-200">
                Error Rate (%)
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  className="field-input rounded-xl px-3 py-2.5 text-slate-100"
                  value={form.errorRatePct}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, errorRatePct: Number(e.target.value) }))
                  }
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm text-slate-200">
                Incident Start
                <input
                  type="datetime-local"
                  className="field-input rounded-xl px-3 py-2.5 text-slate-100"
                  value={toIsoLocal(form.startedAt)}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startedAt: fromLocalToIso(e.target.value) }))
                  }
                  required
                />
              </label>

              <label className="grid gap-1.5 text-sm text-slate-200">
                Dashboard Screenshot (optional)
                <input
                  type="file"
                  accept="image/*"
                  className="field-file rounded-xl px-3 py-2.5 text-xs text-slate-300"
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
                className="btn-primary md:col-span-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {running ? "ARIA Investigating..." : "Run Autonomous Investigation"}
              </button>
            </form>

            {error ? (
              <p className="mt-4 rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </p>
            ) : null}

            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Timeline</h3>
              <ul className="mt-3 grid gap-2.5">
                {steps.map((step) => (
                  <StepRow key={step.id} step={step} />
                ))}
                {!steps.length && !running ? (
                  <li className="panel-soft rounded-xl p-4 text-sm text-slate-400">
                    Investigation events will stream here after you launch a run.
                  </li>
                ) : null}
              </ul>
            </div>
          </section>

          <section className="grid gap-6">
            <article
              className="panel animate-rise rounded-3xl p-5 md:p-6"
              style={{ animationDelay: "180ms" }}
            >
              <h2 className="text-xl font-semibold text-white">Ranked Root Cause</h2>
              {!report ? (
                <p className="mt-3 text-sm text-slate-400">Run an incident to generate the RCA package.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={report.triage.severity} />
                    <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100">
                      Confidence {(report.rca.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="rounded-full border border-indigo-300/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-100">
                      Blast Radius {serviceCount}
                    </span>
                  </div>

                  <p className="text-sm leading-6 text-slate-200">{report.rca.narrative}</p>

                  {topHypothesis ? (
                    <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4">
                      <p className="text-sm font-semibold text-emerald-100">{topHypothesis.title}</p>
                      <p className="mt-1 text-xs text-emerald-100/85">
                        Probability {(topHypothesis.probability * 100).toFixed(0)}%
                      </p>
                      <ul className="mt-2 grid gap-1 text-xs text-emerald-50/95">
                        {topHypothesis.evidence.slice(0, 3).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.13em] text-slate-100">
                      Recommended Plan
                    </h3>
                    <ol className="mt-2 grid gap-1.5 text-sm text-slate-300">
                      {report.rca.recommendedPlan.map((action, index) => (
                        <li key={`${index}-${action}`}>
                          {index + 1}. {action}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </article>

            <article
              className="panel animate-rise rounded-3xl p-5 md:p-6"
              style={{ animationDelay: "230ms" }}
            >
              <h2 className="text-xl font-semibold text-white">ARIA Copilot</h2>
              <p className="mt-1 text-xs text-slate-400">
                Ask for remediation sequencing, rollback strategy, or stakeholder communication.
              </p>
              <AriaCopilotChat />
            </article>
          </section>
        </div>
      </div>
    </main>
  );
}
