# ARIA Frontend

Standalone Next.js UI for ARIA.

## What lives here

- Incident command UI
- Live timeline rendering from backend SSE stream
- CopilotKit chat UI

## Environment

Copy `.env.example` to `.env.local`:

```bash
ARIA_BACKEND_BASE_URL=http://localhost:4000
ARIA_BACKEND_API_KEY=
NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL=http://localhost:4000/copilotkit
```

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3011`.

The frontend expects `aria-backend` to be running.
Incident investigation calls are proxied through `app/api/incidents/investigate/route.ts`.
