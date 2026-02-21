# ARIA — Autonomous Root-cause Intelligence Agent

> Multi-agent AI system that autonomously investigates production incidents, traverses service dependency graphs, and guides on-call engineers to root cause in minutes — not hours.

Built at the **AWS × Datadog GenAI Hackathon 2026** · San Francisco

---

## The Problem

When a production service goes down, engineers spend 30–90 minutes manually correlating logs, metrics, traces, runbooks, and service dependency diagrams. Every minute costs thousands of dollars at enterprise scale.

## The Solution

ARIA is a multi-agent pipeline that:

1. **Triages** — classifies severity and identifies affected services
2. **Investigates** — autonomously queries Datadog logs for live evidence
3. **Synthesizes** — traverses Neo4j service dependency graph for blast radius + cross-references historical runbooks from MongoDB
4. **Remediates** — generates a ranked, confidence-scored fix plan via Bedrock
5. **Communicates** — engineers ask for Slack drafts, stakeholder summaries, and checklists via the copilot chat

**Alert to fix plan: ~25 seconds.**

---

## Architecture

```
Engineer submits alert
        ↓
  [aria-console.tsx]
        ↓
POST /incidents/investigate  (SSE stream)
        ↓
┌─────────────────────────────────────┐
│         Strands Agents Pipeline      │
│                                     │
│  1. Triage Agent                    │
│     └─ Amazon Bedrock (Claude 4.6)  │
│                                     │
│  2. Investigation Agent             │
│     └─ Datadog logs API (live)      │
│                                     │
│  3. RCA Agent                       │
│     ├─ Neo4j (blast radius graph)   │
│     └─ MongoDB (runbook RAG)        │
└─────────────────────────────────────┘
        ↓
Streams step events + final report → UI
        ↓
  Copilot chat for follow-up actions
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM Inference | Amazon Bedrock — Claude Sonnet 4.6 (cross-region inference profile) |
| Agent Orchestration | Strands Agents SDK (triage, investigation, RCA agents) |
| Production Runtime | Amazon Bedrock AgentCore |
| Observability | Datadog LLM Observability (ddtrace — auto-traces all Bedrock calls) |
| Log Queries | Datadog Logs API v2 (live MCP-style evidence collection) |
| Service Graph | Neo4j Aura (Cypher blast-radius traversal) |
| Runbook Store | MongoDB Atlas (historical incident RAG) |
| Frontend | Next.js 16 + custom ag-ui copilot chat |
| Backend | FastAPI (Python) + Express.js (TypeScript) |
| Dev Environment | Kiro IDE |

---

## Demo

| Step | Agent | Action | Result |
|---|---|---|---|
| 1 | Triage | Classify alert | Severity: P1 · Service: payment-svc |
| 2 | Investigation | Query Datadog | DB connection pool exhausted |
| 3 | RCA | Traverse Neo4j | 3 downstream services affected |
| 4 | RCA | RAG over MongoDB | Matches incident from 6 weeks ago |
| 5 | Remediation | Synthesize fix | Scale pool to 200, add circuit breaker · Confidence: 91% |
| 6 | Copilot | Draft stakeholder update | Instant Slack message generated |

---

## Quickstart

### Prerequisites

- Node.js 18+
- Python 3.11+
- AWS credentials with Bedrock access

### Backend (TypeScript)

```bash
cd aria-backend
npm install
cp .env.example .env   # fill in credentials
npm run dev            # http://localhost:4000
```

### Frontend

```bash
cd aria-frontend
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3011
```

### Environment Variables

**`aria-backend/.env`**

```env
ARIA_MODE=live

AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6

DATADOG_API_KEY=
DATADOG_APP_KEY=
DATADOG_SITE=datadoghq.com

NEO4J_URI=neo4j+s://<instance>.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=

MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
```

**`aria-frontend/.env.local`**

```env
NEXT_PUBLIC_ARIA_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL=http://localhost:4000/copilotkit
```

### Seed MongoDB runbooks

```bash
cd aria-backend
python scripts/seed_mongodb.py
```

---

## Requirements Met

| Requirement | Status |
|---|---|
| Amazon Bedrock — Claude Sonnet 4.6 | ✅ |
| Strands Agents — multi-agent pipeline | ✅ |
| Datadog LLM Observability | ✅ |
| Datadog live log queries | ✅ |
| Neo4j service dependency graph | ✅ |
| MongoDB runbook RAG | ✅ |
| CopilotKit copilot chat | ✅ |
| SSE real-time streaming UI | ✅ |

---

## Live Demo

**[aria-frontend-beryl.vercel.app](https://aria-frontend-beryl.vercel.app)**
