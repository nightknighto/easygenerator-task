# Easygenerator — Full Stack Test Task

Authentication module with a **sign up** / **sign in** flow and a protected application page.

| Piece      | Stack                                                        |
| ---------- | ------------------------------------------------------------ |
| Frontend   | Vite + React + TypeScript + Tailwind CSS v4 (`apps/frontend`) |
| Backend    | NestJS + TypeScript, strict mode (`apps/backend`)             |
| Shared lib | `@app/shared` — DTOs shared between both apps (`packages/shared`) |
| Tooling    | pnpm workspaces + Turborepo                                  |

## Prerequisites

- **Node.js ≥ 22**
- **pnpm ≥ 11** — enable via `corepack enable` (the pinned version lives in `packageManager`) or install globally with `npm i -g pnpm`
- **Docker** (Docker Desktop or Engine with Compose v2+) — runs the local MongoDB the backend expects

## Getting started

```bash
pnpm install
cp .env.example .env   # local-dev credentials + MONGODB_URI (gitignored)
docker compose up -d   # MongoDB 8 on localhost:27017 (docker compose ps → healthy)
```

## Development

Run everything in watch mode (shared package rebuilds, backend, frontend) from the repo root:

```bash
pnpm dev
```

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:3000> — if that port is taken, override it with `PORT=3100 pnpm dev` (Vite ignores `PORT` and stays on 5173)

Run a single app:

```bash
pnpm --filter backend start:dev
pnpm --filter frontend dev
```

## Scripts

| Command                  | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `pnpm dev`               | Start all packages in watch mode (Turborepo, parallel)              |
| `pnpm build`             | Build all packages — `@app/shared` first via the task graph          |
| `pnpm lint`              | Lint everything (oxlint on frontend, ESLint on backend)             |
| `pnpm test`              | Run unit tests (Jest on backend)                                    |

Per-package variants: `pnpm --filter <frontend \| backend \| @app/shared> <script>`.

## Repository structure

```
├── apps/
│   ├── frontend/          # Vite + React + TS + Tailwind v4
│   └── backend/           # NestJS API (Mongoose → MongoDB)
├── packages/
│   └── shared/            # @app/shared — request/response DTOs (tsup → ESM + CJS + .d.ts)
├── compose.yaml           # local MongoDB (mongo:8, healthchecked, persistent volume)
├── pnpm-workspace.yaml
└── turbo.json             # task pipeline: build → dev → lint → test
```

Both apps consume the shared library as `"@app/shared": "workspace:*"`, so request/response types are defined once and stay in sync between client and server.
