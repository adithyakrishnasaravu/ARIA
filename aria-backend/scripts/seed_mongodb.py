#!/usr/bin/env python3
"""Seed MongoDB Atlas with ARIA runbook documents.

Usage:
    cd aria-backend
    python scripts/seed_mongodb.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Allow running from project root or scripts dir
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

from pymongo import MongoClient

MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    print("ERROR: MONGODB_URI not set in .env")
    sys.exit(1)


def _ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


RUNBOOKS = [
    # payment-svc
    {
        "service": "payment-svc",
        "tags": ["payment-svc", "database", "connection-pool"],
        "title": "Payment DB Pool Saturation Playbook",
        "summary": "Mitigate high p99 latency and elevated errors caused by connection pool exhaustion.",
        "steps": [
            "Increase orders-db connection pool max from 100 to 200.",
            "Enable circuit breaker for optional downstream calls in payment-svc.",
            "Set fail-fast timeout to 750ms on DB acquire wait path.",
        ],
        "lastUsedAt": _ago(42),
        "similarityScore": 0.93,
    },
    {
        "service": "payment-svc",
        "tags": ["payment-svc", "retry-storm", "latency"],
        "title": "Retry Storm Containment SOP",
        "summary": "Reduce cascading load when retries amplify latency during dependency contention.",
        "steps": [
            "Apply exponential backoff with jitter on payment retry policy.",
            "Cap in-flight requests to orders-db at safe concurrency threshold.",
            "Temporarily disable non-critical synchronous enrichments.",
        ],
        "lastUsedAt": _ago(51),
        "similarityScore": 0.86,
    },
    {
        "service": "payment-svc",
        "tags": ["payment-svc", "rollback", "deploy"],
        "title": "Checkout Rollback Escalation Runbook",
        "summary": "Rollback when checkout/payment deploy correlates with error and latency surge.",
        "steps": [
            "Freeze new rollout and gate traffic to previous stable version.",
            "Rollback latest deployment if error rate remains >8% after pool change.",
            "Post incident update with ETA to support and product channels.",
        ],
        "lastUsedAt": _ago(66),
        "similarityScore": 0.78,
    },
    # orders-api
    {
        "service": "orders-api",
        "tags": ["orders-api", "database", "timeout"],
        "title": "Orders API DB Timeout Runbook",
        "summary": "Handle DB timeouts causing elevated latency in the orders API.",
        "steps": [
            "Check orders-db replica lag and replication health.",
            "Increase query timeout from 2s to 5s for non-critical reads.",
            "Route read traffic to read replica if primary is overloaded.",
        ],
        "lastUsedAt": _ago(28),
        "similarityScore": 0.80,
    },
    # generic
    {
        "service": "__generic__",
        "tags": ["generic", "baseline"],
        "title": "Generic Incident Baseline Runbook",
        "summary": "Generic mitigation workflow for elevated latency and errors.",
        "steps": [
            "Scale affected service replicas by 2x.",
            "Enable short-term circuit breaker for unstable dependencies.",
            "Verify recovery in p95/p99 latency and 5xx error rate.",
        ],
        "lastUsedAt": _ago(30),
        "similarityScore": 0.70,
    },
]


def seed() -> None:
    client = MongoClient(MONGODB_URI)
    try:
        db = client["aria"]
        col = db["runbooks"]
        col.drop()
        result = col.insert_many(RUNBOOKS)
        print(f"✓ Seeded {len(result.inserted_ids)} runbook documents into aria.runbooks")

        col.create_index([("service", 1)])
        col.create_index([("tags", 1)])
        print("✓ Indexes created")
    finally:
        client.close()


if __name__ == "__main__":
    seed()
