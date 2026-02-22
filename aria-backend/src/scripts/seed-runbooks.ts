/**
 * seed-runbooks.ts
 *
 * Populates the MongoDB Atlas `runbooks` collection with operational runbooks
 * for all registered services. Safe to run multiple times — upserts on title + service.
 *
 * Usage:
 *   npm run seed:runbooks
 */

import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE = process.env.MONGODB_DATABASE ?? "aria";

if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set in environment. Add it to .env and retry.");
  process.exit(1);
}

// ── Runbook seed data ─────────────────────────────────────────────────────────

const runbooks = [
  // ── web-store ──────────────────────────────────────────────────────────────
  {
    service: "web-store",
    title: "Rails Constant Redefinition — AddressError Boot Loop",
    summary:
      "Resolve Ruby constant re-initialization warnings that degrade cart and checkout controller on every request.",
    steps: [
      "Identify the deploy that introduced the AddressError constant in shopping_cart_controller.rb.",
      "Roll back to the previous stable release if error rate exceeds 8%.",
      "If rollback is blocked, add `remove_const :AddressError if const_defined?(:AddressError)` guard before constant definition.",
      "Restart affected web-store pods to clear in-memory constant table.",
      "Verify checkout success rate returns to baseline before closing incident.",
    ],
    tags: ["rails", "constant-redefinition", "checkout", "cart"],
    similarityScore: 0.96,
    lastUsedAt: new Date(Date.now() - 18 * 24 * 60 * 60_000).toISOString(),
  },
  {
    service: "web-store",
    title: "Checkout Controller NilClass Failure SOP",
    summary:
      "Mitigate NoMethodError on nil caused by missing address validation object in checkout flow.",
    steps: [
      "Check recent migrations for address model changes that may have dropped validate_address.",
      "Add nil guard in checkout controller before calling validate_address.",
      "Deploy hotfix or roll back dependent migration.",
      "Run smoke test on checkout path to confirm resolution.",
    ],
    tags: ["rails", "nilclass", "checkout", "validation"],
    similarityScore: 0.89,
    lastUsedAt: new Date(Date.now() - 32 * 24 * 60 * 60_000).toISOString(),
  },
  {
    service: "web-store",
    title: "web-store Pod Restart Playbook",
    summary: "Safe rolling restart of web-store pods to flush bad in-memory state.",
    steps: [
      "Confirm error is not database or downstream — check fraud-prevention-api and web-store-mongo health.",
      "Perform rolling restart: kubectl rollout restart deployment/web-store.",
      "Monitor error rate for 5 minutes post-restart.",
      "If error persists, escalate to deploy rollback.",
    ],
    tags: ["kubernetes", "restart", "rollout"],
    similarityScore: 0.81,
    lastUsedAt: new Date(Date.now() - 45 * 24 * 60 * 60_000).toISOString(),
  },

  // ── payment-svc ────────────────────────────────────────────────────────────
  {
    service: "payment-svc",
    title: "Payment DB Pool Saturation Playbook",
    summary:
      "Mitigate high p99 latency and elevated errors caused by connection pool exhaustion.",
    steps: [
      "Increase orders-db connection pool max size from 100 to 200.",
      "Enable circuit breaker for optional downstream calls in payment-svc.",
      "Set fail-fast timeout to 750ms on DB acquire wait path.",
    ],
    tags: ["database", "connection-pool", "latency"],
    similarityScore: 0.93,
    lastUsedAt: new Date(Date.now() - 42 * 24 * 60 * 60_000).toISOString(),
  },
  {
    service: "payment-svc",
    title: "Retry Storm Containment SOP",
    summary:
      "Reduce cascading load when retries amplify latency during dependency contention.",
    steps: [
      "Apply exponential backoff with jitter on payment retry policy.",
      "Cap in-flight requests to orders-db at a safe concurrency threshold.",
      "Temporarily disable non-critical synchronous enrichments.",
    ],
    tags: ["retry-storm", "backoff", "concurrency"],
    similarityScore: 0.86,
    lastUsedAt: new Date(Date.now() - 51 * 24 * 60 * 60_000).toISOString(),
  },
  {
    service: "payment-svc",
    title: "Checkout Rollback Escalation Runbook",
    summary:
      "Rollback candidate when checkout or payment deploy correlates with error and latency surge.",
    steps: [
      "Freeze new rollout and gate traffic to previous stable version.",
      "Rollback latest checkout/payment deployment if error rate remains >8% after pool change.",
      "Post incident update with mitigation ETA to support and product channels.",
    ],
    tags: ["rollback", "deploy", "escalation"],
    similarityScore: 0.78,
    lastUsedAt: new Date(Date.now() - 66 * 24 * 60 * 60_000).toISOString(),
  },

  // ── auth-dotnet ────────────────────────────────────────────────────────────
  {
    service: "auth-dotnet",
    title: "auth-dotnet Token Validation Failure SOP",
    summary:
      "Resolve elevated 401/403 rates caused by certificate rotation or token signing key mismatch.",
    steps: [
      "Check recent certificate rotation or secret rotation in auth-dotnet config.",
      "Verify token signing key matches what downstream services are validating against.",
      "Rotate token signing key and rolling-restart auth-dotnet pods.",
      "Confirm session error rate normalizes within 3 minutes.",
    ],
    tags: ["auth", "token", "certificate", "401"],
    similarityScore: 0.91,
    lastUsedAt: new Date(Date.now() - 28 * 24 * 60 * 60_000).toISOString(),
  },
  {
    service: "auth-dotnet",
    title: "auth-dotnet High Latency — Session Store Saturation",
    summary: "Mitigate auth latency when Redis session store approaches capacity.",
    steps: [
      "Check Redis memory usage and eviction rate in auth-dotnet observability dashboard.",
      "Flush expired sessions: redis-cli -n 0 KEYS '*session*' | xargs redis-cli DEL.",
      "Increase Redis max memory or scale to a larger instance.",
      "Reduce session TTL from 24h to 8h as temporary relief.",
    ],
    tags: ["auth", "redis", "session", "latency"],
    similarityScore: 0.84,
    lastUsedAt: new Date(Date.now() - 55 * 24 * 60 * 60_000).toISOString(),
  },

  // ── fraud-prevention-api ───────────────────────────────────────────────────
  {
    service: "fraud-prevention-api",
    title: "Fraud API Timeout Causing Checkout Degradation",
    summary:
      "Contain checkout impact when fraud-prevention-api response time exceeds SLA.",
    steps: [
      "Check fraud-prevention-api upstream dependency (ML scoring service) health.",
      "If scoring service is degraded, enable fallback: allow-list mode for low-risk transactions.",
      "Set checkout timeout for fraud check to 500ms with soft-fail (allow on timeout).",
      "Page fraud team with blast radius — elevated false-negative risk during degradation.",
    ],
    tags: ["fraud", "timeout", "checkout", "fallback"],
    similarityScore: 0.88,
    lastUsedAt: new Date(Date.now() - 21 * 24 * 60 * 60_000).toISOString(),
  },

  // ── order-intake-service ───────────────────────────────────────────────────
  {
    service: "order-intake-service",
    title: "Order Intake Queue Backlog Runbook",
    summary:
      "Drain order processing backlog when intake consumer lag spikes.",
    steps: [
      "Check Kafka consumer group lag for order-intake-service topic.",
      "Scale order-intake-service consumer replicas by 2x.",
      "If lag exceeds 10k messages, enable priority processing for time-sensitive orders.",
      "Monitor queue depth every 2 minutes until backlog clears.",
    ],
    tags: ["kafka", "queue", "backlog", "consumer"],
    similarityScore: 0.87,
    lastUsedAt: new Date(Date.now() - 38 * 24 * 60 * 60_000).toISOString(),
  },

  // ── web-store-mongo ────────────────────────────────────────────────────────
  {
    service: "web-store-mongo",
    title: "MongoDB Atlas Connection Exhaustion Playbook",
    summary:
      "Resolve connection pool exhaustion on MongoDB Atlas backing web-store product catalogue.",
    steps: [
      "Check Atlas connection count against cluster tier limit in Atlas console.",
      "Identify top connection consumers using Atlas real-time panel.",
      "Reduce web-store pod count temporarily to shed connections.",
      "Enable Atlas connection pooling mode if not already active.",
      "Schedule cluster tier upgrade if baseline connection usage is near limit.",
    ],
    tags: ["mongodb", "connection-pool", "atlas"],
    similarityScore: 0.85,
    lastUsedAt: new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString(),
  },
];

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  const client = new MongoClient(MONGODB_URI!);

  try {
    await client.connect();
    console.log(`Connected to Atlas: ${MONGODB_URI!.split("@")[1]?.split("/")[0]}`);

    const collection = client.db(DATABASE).collection("runbooks");

    // Upsert each runbook by service + title (idempotent)
    let inserted = 0;
    let updated = 0;

    for (const runbook of runbooks) {
      const result = await collection.updateOne(
        { service: runbook.service, title: runbook.title },
        { $set: runbook },
        { upsert: true },
      );

      if (result.upsertedCount > 0) inserted++;
      else if (result.modifiedCount > 0) updated++;
    }

    console.log(
      `✅  Seed complete: ${inserted} inserted, ${updated} updated, ${runbooks.length - inserted - updated} unchanged.`,
    );

    // Show current collection stats
    const total = await collection.countDocuments();
    const byService = await collection
      .aggregate([{ $group: { _id: "$service", count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
      .toArray();

    console.log(`\n📚  Total runbooks in Atlas: ${total}`);
    for (const row of byService) {
      console.log(`   ${row._id}: ${row.count} runbook(s)`);
    }
  } finally {
    await client.close();
  }
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
