# ARIA Frontend

Standalone Next.js UI for ARIA.

## What lives here

- Incident command UI
- Live timeline rendering from backend SSE stream
- CopilotKit chat UI

## Environment

Copy `.env.example` to `.env.local`:

```bash
NEXT_PUBLIC_ARIA_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL=http://localhost:4000/copilotkit
```

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3011`.

The frontend expects `aria-backend` to be running.
