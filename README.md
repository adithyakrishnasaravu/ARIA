# ARIA Monorepo (Split)

This workspace is now split into two apps:

- `aria-frontend`: Next.js UI + CopilotKit components
- `aria-backend`: Express API + multi-agent orchestration + integrations

## Start both

Terminal 1:

```bash
cd aria-backend
cp .env.example .env
npm install
npm run dev
```

Terminal 2:

```bash
cd aria-frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend: `http://localhost:3011`
Backend: `http://localhost:4000`
