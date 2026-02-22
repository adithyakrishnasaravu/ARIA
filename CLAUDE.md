# ARIA — Autonomous Root-cause Intelligence Agent

## What this project is
ARIA is a multi-agent incident investigation platform. It autonomously triages, investigates, and produces a remediation plan for production incidents — from a raw alert to a prioritized action plan in seconds.

## Stack
- **Frontend**: Next.js 16 App Router (`aria-frontend/`) — deployed on Vercel
- **Backend**: TypeScript/Express (`aria-backend/`) — deployed on Railway
- **LLM**: AWS Bedrock, Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`)
- **Storage**: MongoDB Atlas — incidents and runbooks
- **Observability**: Datadog — live error logs, APM spans, metric trends
- **Graph**: Neo4j Aura — service dependency graph, blast radius traversal

## Pipeline
Alert → Fast Triage (~5s, snapshot only) → Investigation (Datadog evidence) → Re-triage (~2s, refined) → RCA (Neo4j + runbooks) → Remediation plan

## Key files
- `aria-backend/src/server.ts` — Express server, SSE streaming, `GET /incidents`, `POST /incidents/investigate`
- `aria-backend/src/aria/orchestrator.ts` — pipeline orchestration
- `aria-backend/src/aria/agents/triage-agent.ts` — pinned to Claude Sonnet 4.6
- `aria-backend/src/aria/agents/rca-agent.ts` — dynamic RCA narrative from evidence
- `aria-backend/src/aria/connectors/mongodb.ts` — `MongoRunbookConnector` + `IncidentStore` (full report persisted)
- `aria-backend/src/aria/connectors/datadog.ts` — live Datadog connector
- `aria-backend/src/aria/connectors/neo4j.ts` — blast radius traversal
- `aria-backend/src/aria/mock-data.ts` — realistic mock Datadog data (Ruby/Rails, K8s hostnames)
- `aria-frontend/components/aria-console.tsx` — main console UI (Investigate + Issues tabs)
- `aria-frontend/app/page.tsx` — landing page
- `aria-frontend/app/api/incidents/route.ts` — GET proxy for incidents list
- `aria-frontend/lib/types.ts` — all shared types including `StoredIncident`

## Environment variables (backend)
`ARIA_MODE=live`, `MONGODB_URI`, `DATADOG_API_KEY`, `DATADOG_APP_KEY`, `AWS_REGION`, `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`

## Environment variables (frontend / Vercel)
`ARIA_BACKEND_BASE_URL` — points to Railway backend URL

## Workflow Orchestration
### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity
### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution
### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project
### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness
### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it
### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Conventions
- No Co-Authored-By in commit messages
- Cream/warm UI theme (`--bg-0: #faf7f2`), Inter font, stone Tailwind palette
- MongoDB `IncidentStore` stores the **full** `InvestigationReport` — nothing stripped
- `isConnectorLive()` gates Datadog/Neo4j on `ARIA_MODE=live`; MongoDB is gated only on `MONGODB_URI` being set
- Backend streams `StreamEvent` via SSE; frontend consumes with `ReadableStream`
