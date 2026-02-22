export type Severity = "sev0" | "sev1" | "sev2" | "sev3";
export type AgentName = "triage" | "investigation" | "rca" | "remediation";
export type LikelyCause = "recent_deploy" | "dependency_failure" | "load_spike" | "unknown";

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
  confidence: number;
  escalateImmediately: boolean;
  likelyCause: LikelyCause;
  requiresHumanConfirmation: boolean;
  dataQualityWarning?: string;
}

export interface LogFinding {
  timestamp: string;
  level: string;
  message: string;
  count?: number;
  stackTrace?: string;
  errorKind?: string;
  traceId?: string;
  host?: string;
}

export interface MetricPoint {
  timestamp: string;
  value: number;
}

export interface CrossServiceLog {
  service: string;
  message: string;
  timestamp: string;
}

export interface DatadogEvidence {
  windowStart: string;
  windowEnd: string;
  topErrors: LogFinding[];
  tracesSummary: string;
  metricsSummary: string;
  connectorMode: "live" | "mock";
  notes: string[];
  errorRateSeries?: MetricPoint[];
  metricTrend?: "rising" | "peaked" | "falling" | "flapping" | "stable";
  spanSummary?: string[];
  crossServiceLogs?: CrossServiceLog[];
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
  | { type: "confirmation_required"; triage: TriageResult }
  | { type: "error"; message: string };
