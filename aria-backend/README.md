# ARIA Backend

Standalone backend for ARIA multi-agent incident investigation.

## Endpoints

- `GET /health`
- `POST /incidents/investigate` (SSE stream)
- `POST /copilotkit` and `GET /copilotkit` (Copilot runtime)

## Scope Cuts (for speed)

- Datadog is logs-only
- MiniMax is stubbed (accepts image input, returns mock analysis)
- Runbooks are hardcoded in code (no MongoDB setup required)
- CopilotKit chat uses Bedrock adapter (requires AWS credentials for responses)

## Neo4j Demo Graph

Seed the 10-node dependency graph:

```bash
npm run seed:neo4j
```

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

Backend runs on `http://localhost:4000` by default.
