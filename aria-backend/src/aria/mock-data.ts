import { AlertPayload, CrossServiceLog, DatadogEvidence, DependencyGraphResult, LogFinding, MetricPoint, RCAResult, Runbook } from "./types";

export const demoAlert: AlertPayload = {
  incidentId: "inc-2026-02-21-webstore-cart-errors",
  service: "web-store",
  summary: "web-store shopping cart AddressError causing elevated checkout failures and latency spike",
  p99LatencyMs: 3800,
  errorRatePct: 11,
  startedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
};

export function mockDatadogEvidence(service: string): DatadogEvidence {
  const now = Date.now();
  const isWebStore = service.includes("web-store") || service.includes("store");

  // ── Realistic error rate series: baseline → deploy lands at t-15m → spike ──
  const errorRateSeries: MetricPoint[] = [
    { timestamp: new Date(now - 30 * 60_000).toISOString(), value: 11 },
    { timestamp: new Date(now - 25 * 60_000).toISOString(), value: 13 },
    { timestamp: new Date(now - 20 * 60_000).toISOString(), value: 17 },
    { timestamp: new Date(now - 15 * 60_000).toISOString(), value: 94 },  // deploy lands
    { timestamp: new Date(now - 10 * 60_000).toISOString(), value: 181 },
    { timestamp: new Date(now -  5 * 60_000).toISOString(), value: 243 },
    { timestamp: new Date(now            ).toISOString(), value: 287 },
  ];

  // ── web-store: Ruby/Rails AddressError scenario ───────────────────────────
  const webStoreErrors: LogFinding[] = [
    {
      timestamp: new Date(now - 90_000).toISOString(),
      level: "error",
      message: "shopping_cart_controller.rb:1221:in `<main>': warning: already initialized constant AddressError (NameError)",
      errorKind: "NameError",
      stackTrace: [
        "/app/app/controllers/shopping_cart_controller.rb:1221:in `<main>'",
        "/app/config/initializers/address_validation.rb:45:in `load'",
        "/app/config/application.rb:89:in `require_relative'",
        "/usr/local/bundle/gems/railties-7.1.3/lib/rails/application/finisher.rb:53:in `eager_load!'",
        "/usr/local/bundle/gems/railties-7.1.3/lib/rails/application.rb:595:in `call'",
      ].join("\n"),
      traceId: "4b14ce197e3d06f9",
      host: "web-store-7d9f8b6c4-xk2p9",
      count: 287,
    },
    {
      timestamp: new Date(now - 3 * 60_000).toISOString(),
      level: "error",
      message: "undefined method 'validate_address' for nil (NoMethodError) — cart.rb:88:in `checkout'",
      errorKind: "NoMethodError",
      stackTrace: [
        "/app/app/models/cart.rb:88:in `checkout'",
        "/app/app/controllers/shopping_cart_controller.rb:54:in `create_order'",
        "/usr/local/bundle/gems/actionpack-7.1.3/lib/action_controller/metal/basic_implicit_render.rb:6:in `send_action'",
        "/usr/local/bundle/gems/actionpack-7.1.3/lib/abstract_controller/base.rb:215:in `process_action'",
      ].join("\n"),
      traceId: "a9f3c821e750b14d",
      host: "web-store-7d9f8b6c4-r8nqw",
      count: 143,
    },
    {
      timestamp: new Date(now - 7 * 60_000).toISOString(),
      level: "error",
      message: "ActiveRecord::RecordInvalid: Validation failed: Address country_code is not included in the list",
      errorKind: "ActiveRecord::RecordInvalid",
      stackTrace: [
        "/app/app/models/order.rb:201:in `save!'",
        "/app/app/services/checkout_service.rb:77:in `finalize_order'",
        "/app/app/controllers/shopping_cart_controller.rb:89:in `checkout'",
        "/usr/local/bundle/gems/activerecord-7.1.3/lib/active_record/validations.rb:80:in `save!'",
      ].join("\n"),
      traceId: "d27fa1c09e448b32",
      host: "web-store-7d9f8b6c4-xk2p9",
      count: 98,
    },
    {
      timestamp: new Date(now - 11 * 60_000).toISOString(),
      level: "warn",
      message: "DEPRECATION WARNING: address_validation gem v2.1.4 conflicts with v2.2.0 — constant AddressError redefined on every request cycle",
      traceId: "c8e19d04a6f72b51",
      host: "web-store-7d9f8b6c4-xk2p9",
      count: 312,
    },
  ];

  // ── generic service: DB pool exhaustion scenario ──────────────────────────
  const genericErrors: LogFinding[] = [
    {
      timestamp: new Date(now - 2 * 60_000).toISOString(),
      level: "error",
      message: "ActiveRecord::ConnectionTimeoutError: could not obtain a database connection within 5.000 seconds (waited 5.000 seconds) (pool_size=100, active=100, waiting=245)",
      errorKind: "ActiveRecord::ConnectionTimeoutError",
      stackTrace: [
        "/usr/local/bundle/gems/activerecord-7.1.3/lib/active_record/connection_adapters/pool_manager.rb:91:in `checkout_and_verify'",
        "/app/app/models/" + service.replace(/-/g, "_") + ".rb:155:in `find_by!'",
        "/app/app/controllers/application_controller.rb:44:in `authenticate!'",
      ].join("\n"),
      traceId: "e3b0c44298fc1c14",
      host: `${service}-6f8d7c9b5-m4kpz`,
      count: 134,
    },
    {
      timestamp: new Date(now - 4 * 60_000).toISOString(),
      level: "error",
      message: "PG::ConnectionBad: connection to server at 'orders-db-primary.internal' (10.0.1.55), port 5432 failed — FATAL: remaining connection slots are reserved for non-replication superuser connections",
      errorKind: "PG::ConnectionBad",
      stackTrace: [
        "/usr/local/bundle/gems/pg-1.5.4/lib/pg/connection.rb:46:in `connect'",
        "/app/lib/database_reconnect.rb:33:in `reconnect!'",
        "/app/app/models/application_record.rb:12:in `with_connection'",
      ].join("\n"),
      traceId: "b5d3a19e8c72f401",
      host: `${service}-6f8d7c9b5-n9xvj`,
      count: 92,
    },
    {
      timestamp: new Date(now - 8 * 60_000).toISOString(),
      level: "warn",
      message: "Retry attempt 5/5 to orders-db-primary exceeded threshold — backing off 30s (total_wait=127s)",
      traceId: "f7c2d8e1a04b9c35",
      host: `${service}-6f8d7c9b5-m4kpz`,
      count: 55,
    },
  ];

  // ── Cross-service logs correlated via trace IDs ───────────────────────────
  const webStoreCrossService: CrossServiceLog[] = [
    {
      service: "checkout-svc",
      message: "Address validation timeout — upstream web-store returned HTTP 500 on POST /cart/checkout (dd.trace_id=4b14ce197e3d06f9, attempt=1)",
      timestamp: new Date(now - 85_000).toISOString(),
    },
    {
      service: "checkout-svc",
      message: "Cart context null after 3 retries — abandoning checkout session and returning 503 to client",
      timestamp: new Date(now - 2.5 * 60_000).toISOString(),
    },
    {
      service: "payment-gateway-svc",
      message: "Order context missing billing_address — rejecting payment authorization (dd.trace_id=a9f3c821e750b14d)",
      timestamp: new Date(now - 2.8 * 60_000).toISOString(),
    },
    {
      service: "notification-svc",
      message: "Order confirmation event dropped — no order_id in checkout-svc payload (correlation_id=d27fa1c09e448b32)",
      timestamp: new Date(now - 1.5 * 60_000).toISOString(),
    },
  ];

  const genericCrossService: CrossServiceLog[] = [
    {
      service: "api-gateway",
      message: `Upstream ${service} returning 503 — circuit breaker OPEN after 5 consecutive failures (threshold=500ms)`,
      timestamp: new Date(now - 3 * 60_000).toISOString(),
    },
    {
      service: "order-svc",
      message: `Downstream DB call to ${service} timed out — falling back to stale cache (ttl=300s)`,
      timestamp: new Date(now - 5 * 60_000).toISOString(),
    },
  ];

  const topErrors = isWebStore ? webStoreErrors : genericErrors;
  const crossServiceLogs = isWebStore ? webStoreCrossService : genericCrossService;

  const spanSummary = isWebStore
    ? ["Web request avg: 3810ms", "HTTP client avg: 1240ms", "DB query avg: 145ms"]
    : ["DB Acquire Connection avg: 2820ms", "Web request avg: 3410ms", "HTTP client avg: 980ms"];

  const tracesSummary = isWebStore
    ? `Errors concentrated in shopping_cart_controller — AddressError constant re-initialized on every request cycle, consistent with gem autoload regression from recent deploy. ${webStoreCrossService.length} correlated entries across checkout-svc, payment-gateway-svc, and notification-svc confirm blast radius.`
    : `99th percentile span latency concentrated in DB Acquire Connection (avg 2820ms). Pool exhaustion at orders-db-primary causing queue wait inflation. ${genericCrossService.length} upstream services (api-gateway, order-svc) already in degraded fallback mode.`;

  const metricsSummary = isWebStore
    ? `Alert snapshot: p99=${3810}ms, error-rate=11%. Error rate trend: RISING — 11 (baseline) → 287 errors/5min over 30-minute window. Span: Web request avg 3810ms, HTTP client avg 1240ms.`
    : `Alert snapshot: p99=3410ms, error-rate=8%. Error rate trend: RISING — DB connection utilization pegged at 100%. DB Acquire Connection avg 2820ms.`;

  return {
    windowStart: new Date(now - 30 * 60_000).toISOString(),
    windowEnd: new Date(now).toISOString(),
    topErrors,
    tracesSummary,
    metricsSummary,
    connectorMode: "mock",
    notes: [
      "Using synthetic Datadog data — logs mirror real Rails production error signatures.",
      "Stack traces, trace IDs, and pod hostnames reflect k8s + Rails 7.1 production environment.",
    ],
    errorRateSeries,
    metricTrend: "rising",
    spanSummary,
    crossServiceLogs,
  };
}

export function mockDependencyGraph(service: string): DependencyGraphResult {
  if (service.includes("payment")) {
    return {
      impactedServices: [
        "checkout-svc",
        "order-svc",
        "invoice-svc",
        "notification-svc",
      ],
      upstreamServices: ["api-gateway", "identity-svc"],
      connectorMode: "mock",
    };
  }

  return {
    impactedServices: ["api-gateway"],
    upstreamServices: ["web-frontend"],
    connectorMode: "mock",
  };
}

export function mockRunbooks(service: string): Runbook[] {
  return [
    {
      title: `${service} DB Pool Saturation Playbook`,
      summary:
        "When DB pool utilization exceeds 95% and p99 latency rises, increase pool and enable fail-fast behavior.",
      steps: [
        "Scale connection pool max size from 100 to 200.",
        "Enable circuit breaker in payment-svc for non-critical calls.",
        "Reduce synchronous writes in order finalization path.",
      ],
      lastUsedAt: new Date(Date.now() - 6 * 7 * 24 * 60 * 60_000).toISOString(),
      similarityScore: 0.93,
    },
    {
      title: "Database Hot Partition Mitigation",
      summary:
        "If read hot spots emerge, reroute reads to replica and enable adaptive cache policy.",
      steps: [
        "Shift 30% read traffic to read replica.",
        "Enable request-level timeout at 800ms for enrichment calls.",
      ],
      lastUsedAt: new Date(Date.now() - 42 * 24 * 60 * 60_000).toISOString(),
      similarityScore: 0.74,
    },
  ];
}

export function mockRcaResult(service: string): RCAResult {
  const runbooks = mockRunbooks(service);

  return {
    hypotheses: [
      {
        title: "orders-db connection pool limit reached",
        probability: 0.91,
        evidence: [
          "Datadog logs show repeated pool exhaustion and acquire timeouts.",
          "Trace breakdown attributes p99 latency to DB connection wait.",
          "Historical runbook from 6 weeks ago matches this signature.",
        ],
        remediation: [
          "Increase orders-db pool max to 200.",
          "Apply circuit breaker in payment-svc for optional downstream calls.",
        ],
      },
      {
        title: "Slow query burst from checkout release",
        probability: 0.62,
        evidence: [
          "Recent deploy on checkout-svc overlaps error spike window.",
          "Query latency tail is elevated but secondary to pool wait.",
        ],
        remediation: [
          "Rollback recent checkout-svc release if latency remains after pool fix.",
        ],
      },
    ],
    blastRadius: [
      "checkout-svc",
      "order-svc",
      "invoice-svc",
      "notification-svc",
    ],
    runbooks,
    recommendedPlan: [
      "Apply pool limit increase from 100 -> 200 immediately.",
      "Enable payment-svc circuit breaker and 750ms timeout for optional dependencies.",
      "Create follow-up: tune DB query plan and add saturation alert at 85% pool usage.",
    ],
    confidence: 0.91,
    narrative:
      "Highest-likelihood root cause is DB pool saturation on orders-db, triggering queue wait inflation and cascading latency across payment critical path.",
  };
}
