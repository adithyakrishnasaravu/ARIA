"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { InvestigationReport, StreamEvent, TimelineStep, TriageResult } from "@/lib/types";

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
  incidentId: "inc-2026-02-21-webstore-cart-errors",
  service: "web-store",
  summary: "web-store shopping cart AddressError causing elevated checkout failures and latency spike",
  p99LatencyMs: 3800,
  errorRatePct: 11,
  startedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
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
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `data:${file.type};base64,${btoa(binary)}`;
}

function SeverityBadge({ severity }: { severity: string }) {
  const tone =
    severity === "sev1"
      ? "bg-rose-100 text-rose-700 ring-rose-200"
      : severity === "sev2"
        ? "bg-amber-100 text-amber-800 ring-amber-200"
        : "bg-emerald-100 text-emerald-800 ring-emerald-200";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1 ${tone}`}>
      {severity}
    </span>
  );
}

function StepRow({ step }: { step: TimelineStep }) {
  const tone =
    step.status === "running"
      ? "border-sky-200 bg-sky-50"
      : step.status === "failed"
        ? "border-rose-200 bg-rose-50"
        : "border-emerald-200 bg-emerald-50";

  const dot =
    step.status === "running"
      ? "bg-sky-400 animate-pulse"
      : step.status === "failed"
        ? "bg-rose-400"
        : "bg-emerald-500";

  return (
    <li className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
          <p className="text-sm font-semibold text-stone-800">{step.title}</p>
        </div>
        <span className="rounded-full bg-stone-100 border border-stone-200/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-stone-500">
          {step.agent}
        </span>
      </div>
      <p className="mt-1.5 pl-3.5 text-xs leading-5 text-stone-600">{step.detail}</p>
      <p className="mt-1.5 pl-3.5 text-[11px] text-stone-400">
        {new Date(step.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
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

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const userMsg: ChatMessage = { role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.text }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, threadId: crypto.randomUUID(), runId: crypto.randomUUID() }),
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
    /* Dark terminal-style chat — mirrors the landing page terminal section */
    <div className="mt-3 overflow-hidden rounded-2xl bg-stone-950 border border-stone-800 flex flex-col h-[430px]">
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-800 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 text-stone-500 text-[11px] font-mono">ARIA Copilot</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-stone-600">Suggested prompts:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full text-left rounded-xl border border-stone-800 bg-stone-900 px-3 py-2 text-xs text-stone-400 hover:bg-stone-800 hover:text-stone-300 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-6 whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-stone-800 text-stone-200"
                : "bg-stone-900 text-stone-300 border border-stone-800"
            }`}>
              {m.text || <span className="animate-pulse text-stone-600">…</span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex gap-2 border-t border-stone-800 p-3 shrink-0"
      >
        <input
          className="flex-1 rounded-xl bg-stone-900 border border-stone-800 px-3 py-2 text-xs text-stone-200 placeholder-stone-600 outline-none focus:ring-1 focus:ring-stone-600 font-mono"
          placeholder="Ask ARIA about this incident…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-stone-800 border border-stone-700 px-4 py-2 text-xs font-medium text-stone-300 hover:bg-stone-700 disabled:opacity-40 transition-colors"
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
  const [pendingConfirmation, setPendingConfirmation] = useState<TriageResult | null>(null);

  const topHypothesis = report?.rca.hypotheses[0] ?? null;
  const serviceCount = useMemo(() => report?.rca.blastRadius.length ?? 0, [report]);
  const completedSteps = useMemo(() => steps.filter((s) => s.status === "completed").length, [steps]);
  const connectorMode = report?.investigation.datadog.connectorMode ?? "pending";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRunning(true);
    setSteps([]);
    setReport(null);
    setError(null);
    setPendingConfirmation(null);

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
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop() ?? "";

        for (const message of messages) {
          const dataLine = message.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;

          const eventPayload = JSON.parse(dataLine.slice(6)) as StreamEvent;

          if (eventPayload.type === "step") {
            await new Promise((r) => setTimeout(r, 1000));
            setSteps((current) => [...current, eventPayload.step]);
          }
          if (eventPayload.type === "confirmation_required") {
            setPendingConfirmation(eventPayload.triage);
          }
          if (eventPayload.type === "report") {
            await new Promise((r) => setTimeout(r, 1000));
            setReport(eventPayload.report);
            setPendingConfirmation(null);
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
    <div className="min-h-screen" style={{ background: "var(--bg-0)" }}>

      {/* ── Nav ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 border-b border-stone-200/70"
        style={{ background: "rgba(250,247,242,0.92)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-stone-400 hover:text-stone-700 transition-colors">
            ← Home
          </Link>
          <span className="text-stone-200">|</span>
          <span className="font-semibold text-base tracking-tight text-stone-900">ARIA</span>
          <span className="hidden sm:inline text-[10px] uppercase tracking-[0.18em] text-stone-400">
            Control Center
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-emerald-700">
            <span className="status-dot" />
            Live
          </span>
          <span className="rounded-full border border-stone-200/70 bg-stone-100/80 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-stone-500">
            {connectorMode}
          </span>
        </div>
      </nav>

      <main className="pt-24 pb-16 px-4 md:px-8">
        <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6">

          {/* ── Header ── */}
          <header className="rounded-2xl border border-stone-200/70 bg-stone-50/60 p-6 md:p-8">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
              ARIA Control Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
              Autonomous triage, evidence collection, blast-radius analysis, and remediation synthesis — powered by Datadog · Neo4j · Claude Sonnet 4.6.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Stages complete", value: `${completedSteps}` },
                { label: "RCA confidence", value: report ? `${(report.rca.confidence * 100).toFixed(0)}%` : "—" },
                { label: "Blast radius", value: report ? `${serviceCount} services` : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-2xl border border-stone-200/70 bg-white/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-stone-400">{label}</p>
                  <p className="mt-1 text-2xl font-semibold text-stone-900">{value}</p>
                </div>
              ))}
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[1.24fr_1fr]">

            {/* ── Left: Input + Timeline ── */}
            <section className="rounded-2xl border border-stone-200/70 bg-stone-50/60 p-5 md:p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">Incident Input</h2>
                  <p className="mt-0.5 text-xs text-stone-400">
                    Pre-loaded with demo scenario · in production, auto-populated from Datadog / PagerDuty
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(defaultForm)}
                    className="rounded-full border border-stone-300/70 bg-stone-100 px-3 py-1.5 text-[11px] font-medium text-stone-600 hover:bg-stone-200 transition-colors"
                  >
                    Load Demo Alert
                  </button>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] uppercase tracking-[0.13em] text-sky-700">
                    Live Stream
                  </span>
                </div>
              </div>

              <form onSubmit={onSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
                {[
                  { label: "Incident ID", key: "incidentId", type: "text" },
                  { label: "Service", key: "service", type: "text" },
                ].map(({ label, key, type }) => (
                  <label key={key} className="grid gap-1.5 text-sm text-stone-700">
                    {label}
                    <input
                      type={type}
                      className="field-input rounded-xl px-3 py-2.5 text-stone-800 text-sm"
                      value={form[key as keyof FormState] as string}
                      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      required
                    />
                  </label>
                ))}

                <label className="grid gap-1.5 text-sm text-stone-700 md:col-span-2">
                  Alert Summary
                  <input
                    className="field-input rounded-xl px-3 py-2.5 text-stone-800 text-sm"
                    value={form.summary}
                    onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm text-stone-700">
                  p99 Latency (ms)
                  <input
                    type="number"
                    min={0}
                    className="field-input rounded-xl px-3 py-2.5 text-stone-800 text-sm"
                    value={form.p99LatencyMs}
                    onChange={(e) => setForm((prev) => ({ ...prev, p99LatencyMs: Number(e.target.value) }))}
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm text-stone-700">
                  Error Rate (%)
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    className="field-input rounded-xl px-3 py-2.5 text-stone-800 text-sm"
                    value={form.errorRatePct}
                    onChange={(e) => setForm((prev) => ({ ...prev, errorRatePct: Number(e.target.value) }))}
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm text-stone-700">
                  Incident Start
                  <input
                    type="datetime-local"
                    className="field-input rounded-xl px-3 py-2.5 text-stone-800 text-sm"
                    value={toIsoLocal(form.startedAt)}
                    onChange={(e) => setForm((prev) => ({ ...prev, startedAt: fromLocalToIso(e.target.value) }))}
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm text-stone-700">
                  Dashboard Screenshot (optional)
                  <input
                    type="file"
                    accept="image/*"
                    className="field-file rounded-xl px-3 py-2.5 text-xs text-stone-600"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) { setForm((prev) => ({ ...prev, screenshotBase64: undefined })); return; }
                      const screenshotBase64 = await fileToBase64(file);
                      setForm((prev) => ({ ...prev, screenshotBase64 }));
                    }}
                  />
                </label>

                <button
                  type="submit"
                  disabled={running}
                  className="md:col-span-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? "ARIA Investigating…" : "Run Autonomous Investigation →"}
                </button>
              </form>

              {error && (
                <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              )}

              {pendingConfirmation && (
                <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                    <p className="text-sm font-semibold text-rose-800">
                      SEV1 — Human Confirmation Required Before Remediation
                    </p>
                  </div>
                  <p className="mt-3 text-xs text-rose-700 leading-5">
                    {pendingConfirmation.urgencyReason}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-rose-600">
                    <span>Cause: <strong className="text-rose-800">{pendingConfirmation.likelyCause.replace(/_/g, " ")}</strong></span>
                    <span>Confidence: <strong className="text-rose-800">{(pendingConfirmation.confidence * 100).toFixed(0)}%</strong></span>
                    <span>Window: <strong className="text-rose-800">{pendingConfirmation.investigationWindowMinutes}m</strong></span>
                  </div>
                  {pendingConfirmation.dataQualityWarning && (
                    <p className="mt-2 text-xs text-amber-700">⚠ {pendingConfirmation.dataQualityWarning}</p>
                  )}
                  <p className="mt-3 text-xs text-stone-500">RCA and remediation plan are being generated. Review before executing any actions.</p>
                </div>
              )}

              <div className="mt-8">
                <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400 mb-3">Timeline</p>
                <ul className="grid gap-2.5">
                  {steps.map((step) => (
                    <StepRow key={step.id} step={step} />
                  ))}
                  {!steps.length && !running && (
                    <li className="rounded-2xl border border-stone-200/70 bg-white/60 p-4 text-sm text-stone-400">
                      Investigation events will stream here after you launch a run.
                    </li>
                  )}
                </ul>
              </div>
            </section>

            {/* ── Right: RCA + Copilot ── */}
            <section className="grid gap-6 content-start">

              {/* RCA */}
              <article className="rounded-2xl border border-stone-200/70 bg-stone-50/60 p-5 md:p-6">
                <h2 className="text-lg font-semibold text-stone-900">Ranked Root Cause</h2>
                {!report ? (
                  <p className="mt-3 text-sm text-stone-400">Run an incident to generate the RCA package.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={report.triage.severity} />
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                        Confidence {(report.rca.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                        Blast Radius {serviceCount}
                      </span>
                    </div>

                    <p className="text-sm leading-6 text-stone-600">{report.rca.narrative}</p>

                    {topHypothesis && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-sm font-semibold text-emerald-900">{topHypothesis.title}</p>
                        <p className="mt-1 text-xs text-emerald-700">
                          Probability {(topHypothesis.probability * 100).toFixed(0)}%
                        </p>
                        <ul className="mt-2 grid gap-1 text-xs text-emerald-800 leading-5">
                          {topHypothesis.evidence.slice(0, 3).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-stone-400 mb-2">Recommended Plan</p>
                      <ol className="grid gap-2 text-sm text-stone-700">
                        {report.rca.recommendedPlan.map((action, index) => (
                          <li key={`${index}-${action}`} className="flex gap-2">
                            <span className="text-stone-400 shrink-0 font-mono text-xs mt-0.5">{index + 1}.</span>
                            {action}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </article>

              {/* Copilot */}
              <article className="rounded-2xl border border-stone-200/70 bg-stone-50/60 p-5 md:p-6">
                <h2 className="text-lg font-semibold text-stone-900">ARIA Copilot</h2>
                <p className="mt-1 text-xs text-stone-400">
                  Ask for remediation sequencing, rollback strategy, or stakeholder communication.
                </p>
                <AriaCopilotChat />
              </article>

            </section>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-stone-200/60 py-6 px-8 flex items-center justify-between text-xs text-stone-400">
        <span className="font-medium text-stone-500">ARIA Control Center</span>
        <span>Claude Sonnet 4.6 · AWS Bedrock</span>
      </footer>
    </div>
  );
}
