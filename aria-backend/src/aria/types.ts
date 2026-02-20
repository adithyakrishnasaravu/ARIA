export type Severity = "sev0" | "sev1" | "sev2" | "sev3";
export type AgentName = "triage" | "investigation" | "rca";

export interface AlertPayload {
  incidentId: string;
  service: string;
  summary: string;
  p99LatencyMs: number;
  errorRatePct: number;
  startedAt: string;
  screenshotBase64?: string;
}

export interface TriageResult {
  severity: Severity;
  affectedService: string;
  urgencyReason: string;
  investigationWindowMinutes: number;
}

export interface LogFinding {
  timestamp: string;
  level: string;
  message: string;
  count?: number;
}

export interface DatadogEvidence {
  windowStart: string;
  windowEnd: string;
  topErrors: LogFinding[];
  tracesSummary: string;
  metricsSummary: string;
  connectorMode: "live" | "mock";
  notes: string[];
}

export interface MiniMaxEvidence {
  summary: string;
  anomalies: string[];
  connectorMode: "live" | "mock";
}

export interface InvestigationResult {
  datadog: DatadogEvidence;
  minimax?: MiniMaxEvidence;
}

export interface DependencyGraphResult {
  impactedServices: string[];
  upstreamServices: string[];
  connectorMode: "live" | "mock";
}

export interface Runbook {
  title: string;
  summary: string;
  steps: string[];
  lastUsedAt: string;
  similarityScore: number;
}

export interface Hypothesis {
  title: string;
  probability: number;
  evidence: string[];
  remediation: string[];
}

export interface RCAResult {
  hypotheses: Hypothesis[];
  blastRadius: string[];
  runbooks: Runbook[];
  recommendedPlan: string[];
  confidence: number;
  narrative: string;
}

export interface InvestigationReport {
  alert: AlertPayload;
  triage: TriageResult;
  investigation: InvestigationResult;
  rca: RCAResult;
}

export interface TimelineStep {
  id: string;
  agent: AgentName;
  status: "running" | "completed" | "failed";
  title: string;
  detail: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export type StreamEvent =
  | { type: "step"; step: TimelineStep }
  | { type: "report"; report: InvestigationReport }
  | { type: "error"; message: string };
