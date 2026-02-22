import { ariaConfig, isConnectorLive } from "../config";
import { mockDatadogEvidence } from "../mock-data";
import { AlertPayload, CrossServiceLog, DatadogEvidence, LogFinding, MetricPoint } from "../types";

// ── Datadog API response shapes ───────────────────────────────────────────────

interface DatadogEventsResponse {
  events?: Array<{
    title?: string;
    tags?: string[];
    date_happened?: number;
  }>;
}

interface DatadogLogsResponse {
  data?: Array<{
    attributes?: {
      timestamp?: string;
      status?: string;
      message?: string;
      host?: string;
      attributes?: Record<string, unknown>;
    };
  }>;
}

interface DatadogAggregateResponse {
  data?: {
    buckets?: Array<{
      by?: Record<string, string>;
      computes?: Record<string, number>;
    }>;
  };
}

interface DatadogMetricsResponse {
  series?: Array<{
    pointlist?: Array<[number, number]>;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ddHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "DD-API-KEY": ariaConfig.datadog.apiKey ?? "",
    "DD-APPLICATION-KEY": ariaConfig.datadog.appKey ?? "",
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function analyzeTrend(
  values: number[],
): "rising" | "peaked" | "falling" | "flapping" | "stable" {
  if (values.length < 3) return "stable";

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const deltas = values.slice(1).map((v, i) => v - values[i]);
  const avgAbsDelta = deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length;

  if (avgAbsDelta < mean * 0.08) return "stable";

  const positives = deltas.filter((d) => d > 0).length;
  const negatives = deltas.filter((d) => d < 0).length;

  if (positives === deltas.length) return "rising";
  if (negatives === deltas.length) return "falling";

  const mid = Math.floor(deltas.length / 2);
  const firstHalfPositive = deltas.slice(0, mid).filter((d) => d > 0).length;
  const secondHalfNegative = deltas.slice(mid).filter((d) => d < 0).length;
  if (firstHalfPositive >= mid * 0.6 && secondHalfNegative >= (deltas.length - mid) * 0.6) {
    return "peaked";
  }

  return "flapping";
}

function buildMetricsSummary(
  alert: AlertPayload,
  trend: DatadogEvidence["metricTrend"],
  spanSummary: string[],
): string {
  const parts: string[] = [
    `Alert snapshot: p99=${alert.p99LatencyMs}ms, error-rate=${alert.errorRatePct}%.`,
  ];
  if (trend) {
    parts.push(`Error rate trend over window: ${trend.toUpperCase()}.`);
  }
  if (spanSummary.length > 0) {
    parts.push(`Span breakdown — ${spanSummary.join(", ")}.`);
  }
  return parts.join(" ");
}

// ── DatadogConnector ──────────────────────────────────────────────────────────

export class DatadogConnector {
  // ── 1. Full log attributes: message, stack trace, error kind, trace ID ──────
  private async fetchFullLogs(
    service: string,
    from: Date,
    to: Date,
  ): Promise<LogFinding[]> {
    const response = await fetch(
      `https://api.${ariaConfig.datadog.site}/api/v2/logs/events/search`,
      {
        method: "POST",
        headers: ddHeaders(),
        body: JSON.stringify({
          filter: {
            from: from.toISOString(),
            to: to.toISOString(),
            query: `service:${service} (status:error OR level:error OR @level:error)`,
          },
          sort: "timestamp",
          page: { limit: 20 },
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) throw new Error(`Logs API ${response.status}`);

    const payload = (await response.json()) as DatadogLogsResponse;
    return (payload.data ?? []).slice(0, 8).map((item) => {
      const attrs = item.attributes;
      const nested = attrs?.attributes ?? {};

      return {
        timestamp: attrs?.timestamp ?? new Date().toISOString(),
        level: attrs?.status ?? "error",
        message:
          str(nested["message"]) ??
          str(nested["msg"]) ??
          str(attrs?.message) ??
          "Unknown log line",
        stackTrace:
          str(nested["error.stack"]) ??
          str(nested["@error.stack"]) ??
          str(nested["exception.stacktrace"]) ??
          str(nested["stack_trace"]),
        errorKind:
          str(nested["error.kind"]) ??
          str(nested["@error.kind"]) ??
          str(nested["exception.type"]) ??
          str(nested["error_type"]),
        traceId:
          str(nested["dd.trace_id"]) ??
          str(nested["trace_id"]) ??
          str(nested["traceId"]),
        host: str(nested["host"]) ?? str(attrs?.host),
      } satisfies LogFinding;
    });
  }

  // ── 2. Error count time series: 5-min buckets over window ───────────────────
  private async fetchErrorTrend(
    service: string,
    from: Date,
    to: Date,
  ): Promise<MetricPoint[]> {
    const response = await fetch(
      `https://api.${ariaConfig.datadog.site}/api/v2/logs/analytics/aggregate`,
      {
        method: "POST",
        headers: ddHeaders(),
        body: JSON.stringify({
          compute: [{ aggregation: "count", type: "total" }],
          filter: {
            from: from.toISOString(),
            to: to.toISOString(),
            query: `service:${service} (status:error OR level:error OR @level:error)`,
          },
          group_by: [
            {
              facet: "timestamp",
              type: "time",
              interval: "5m",
              sort: { type: "measure", aggregation: "count", order: "asc" },
            },
          ],
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) return [];

    const payload = (await response.json()) as DatadogAggregateResponse;
    return (payload.data?.buckets ?? []).map((bucket) => ({
      timestamp: bucket.by?.["timestamp"] ?? new Date().toISOString(),
      value: bucket.computes?.["c0"] ?? 0,
    }));
  }

  // ── 3. APM span metrics: request and DB avg latency ─────────────────────────
  private async fetchSpanMetrics(
    service: string,
    from: Date,
    to: Date,
  ): Promise<string[]> {
    const fromUnix = Math.floor(from.getTime() / 1000);
    const toUnix = Math.floor(to.getTime() / 1000);

    const queries: Array<[string, string]> = [
      [`avg:trace.web.request.duration{service:${service}}`, "Web request avg"],
      [`avg:trace.db.query.duration{service:${service}}`, "DB query avg"],
      [`avg:trace.http.request.duration{service:${service}}`, "HTTP client avg"],
    ];

    const results = await Promise.allSettled(
      queries.map(async ([query, label]) => {
        const url = new URL(`https://api.${ariaConfig.datadog.site}/api/v1/query`);
        url.searchParams.set("from", String(fromUnix));
        url.searchParams.set("to", String(toUnix));
        url.searchParams.set("query", query);

        const response = await fetch(url.toString(), {
          headers: ddHeaders(),
          cache: "no-store",
        });

        if (!response.ok) return null;

        const payload = (await response.json()) as DatadogMetricsResponse;
        const pointlist = payload.series?.[0]?.pointlist;
        if (!pointlist?.length) return null;

        const lastValue = pointlist[pointlist.length - 1]?.[1] ?? 0;
        return `${label}: ${(lastValue / 1_000_000).toFixed(0)}ms`;
      }),
    );

    return results
      .filter((r) => r.status === "fulfilled" && r.value !== null)
      .map((r) => (r as PromiseFulfilledResult<string>).value);
  }

  // ── Cross-service trace correlation ─────────────────────────────────────────
  private async fetchCrossServiceLogs(
    traceIds: string[],
    service: string,
    from: Date,
    to: Date,
  ): Promise<CrossServiceLog[]> {
    if (traceIds.length === 0) return [];

    const traceQuery = traceIds
      .slice(0, 5)
      .map((id) => `@dd.trace_id:${id}`)
      .join(" OR ");

    const response = await fetch(
      `https://api.${ariaConfig.datadog.site}/api/v2/logs/events/search`,
      {
        method: "POST",
        headers: ddHeaders(),
        body: JSON.stringify({
          filter: {
            from: from.toISOString(),
            to: to.toISOString(),
            query: `(${traceQuery}) -service:${service}`,
          },
          sort: "timestamp",
          page: { limit: 15 },
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) return [];

    const payload = (await response.json()) as DatadogLogsResponse;
    return (payload.data ?? []).slice(0, 10).map((item) => {
      const attrs = item.attributes;
      const nested = attrs?.attributes ?? {};
      return {
        service: str(nested["service"]) ?? str(nested["dd.service"]) ?? "unknown-service",
        message:
          str(nested["message"]) ?? str(nested["msg"]) ?? str(attrs?.message) ?? "unknown",
        timestamp: attrs?.timestamp ?? new Date().toISOString(),
      };
    });
  }

  // ── Deploy signal ────────────────────────────────────────────────────────────
  async fetchRecentDeploys(service: string, windowMinutes = 30): Promise<string[]> {
    if (!isConnectorLive("datadog")) return [];

    const end = Math.floor(Date.now() / 1000);
    const start = end - windowMinutes * 60;

    try {
      const url = new URL(`https://api.${ariaConfig.datadog.site}/api/v1/events`);
      url.searchParams.set("start", String(start));
      url.searchParams.set("end", String(end));
      url.searchParams.set("tags", `service:${service}`);

      const response = await fetch(url.toString(), {
        headers: ddHeaders(),
        cache: "no-store",
      });

      if (!response.ok) return [];

      const payload = (await response.json()) as DatadogEventsResponse;
      return (payload.events ?? [])
        .filter(
          (e) =>
            e.tags?.some((t) => t.includes("deploy") || t.includes("release")) ||
            e.title?.toLowerCase().includes("deploy"),
        )
        .map((e) => e.title ?? "deployment event")
        .slice(0, 3);
    } catch {
      return [];
    }
  }

  // ── Main evidence fetch ──────────────────────────────────────────────────────
  async fetchEvidence(alert: AlertPayload, windowMinutes: number): Promise<DatadogEvidence> {
    if (!isConnectorLive("datadog")) {
      return mockDatadogEvidence(alert.service);
    }

    const to = new Date();
    const from = new Date(to.getTime() - windowMinutes * 60_000);

    try {
      // All three fetches in parallel
      const [logsResult, trendResult, spanResult] = await Promise.allSettled([
        this.fetchFullLogs(alert.service, from, to),
        this.fetchErrorTrend(alert.service, from, to),
        this.fetchSpanMetrics(alert.service, from, to),
      ]);

      const logs = logsResult.status === "fulfilled" ? logsResult.value : [];
      const errorRateSeries = trendResult.status === "fulfilled" ? trendResult.value : [];
      const spanSummary = spanResult.status === "fulfilled" ? spanResult.value : [];

      // Cross-service correlation using trace IDs found in logs
      const traceIds = logs.map((l) => l.traceId).filter((id): id is string => Boolean(id));
      const crossServiceLogs = await this.fetchCrossServiceLogs(
        traceIds,
        alert.service,
        from,
        to,
      ).catch(() => []);

      const effectiveErrors =
        logs.length > 0 ? logs : mockDatadogEvidence(alert.service).topErrors;

      const metricTrend =
        errorRateSeries.length >= 3
          ? analyzeTrend(errorRateSeries.map((p) => p.value))
          : undefined;

      const tracesSummary =
        crossServiceLogs.length > 0
          ? `Trace correlation found ${crossServiceLogs.length} related entries across ${new Set(crossServiceLogs.map((l) => l.service)).size} upstream/downstream services.`
          : traceIds.length > 0
            ? `${traceIds.length} trace IDs found in logs but no correlated cross-service errors detected.`
            : "No trace IDs in log attributes — APM instrumentation may not be configured.";

      const notes: string[] = [];
      if (logs.length === 0) notes.push("No live logs found — using mock error signals.");
      if (errorRateSeries.length === 0) notes.push("Error trend unavailable — log aggregate API returned no data.");
      if (spanSummary.length === 0) notes.push("APM span metrics unavailable — service may not be instrumented.");

      return {
        windowStart: from.toISOString(),
        windowEnd: to.toISOString(),
        topErrors: effectiveErrors,
        tracesSummary,
        metricsSummary: buildMetricsSummary(alert, metricTrend, spanSummary),
        connectorMode: "live",
        notes,
        errorRateSeries: errorRateSeries.length > 0 ? errorRateSeries : undefined,
        metricTrend,
        spanSummary: spanSummary.length > 0 ? spanSummary : undefined,
        crossServiceLogs: crossServiceLogs.length > 0 ? crossServiceLogs : undefined,
      };
    } catch (error) {
      const fallback = mockDatadogEvidence(alert.service);
      return {
        ...fallback,
        notes: [
          ...fallback.notes,
          `Datadog live query failed: ${error instanceof Error ? error.message : "unknown error"}`,
        ],
      };
    }
  }
}
