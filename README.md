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
docker compose up -d   # MongoDB 8 on :27017 + MailPit (SMTP :1025, UI :8025)
```

## Development

Run everything in watch mode (shared package rebuilds, backend, frontend) from the repo root:

```bash
pnpm dev
```

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:3000> — if that port is taken, override it with `PORT=3100 pnpm dev` (Vite ignores `PORT` and stays on 5173)
- MailPit: <http://localhost:8025> — dev mail catcher; every signup email the backend sends lands here (and the signup link is also logged to the backend console)

Run a single app:

```bash
pnpm --filter backend start:dev
pnpm --filter frontend dev
```

## Auth flow

Email-link sign-up, cookie-based sign-in with rotating DB-backed refresh tokens.
Request/response shapes are the Zod schemas in `@app/shared`; errors always come
back as `{ statusCode, code, message, details? }`.

| Method | Endpoint                  | Body / Auth                              | Success | Notes |
| ------ | ------------------------- | ---------------------------------------- | ------- | ----- |
| POST   | `/api/auth/signup/request`  | `{ email }`                              | 200 `{ message }` | Always the same generic message (anti-enumeration). New address → single-use token (sha256-hashed in Mongo, 1 h TTL) emailed as `${FRONTEND_URL}/signup/complete?token=…`; repeat requests invalidate the previous token. |
| POST   | `/api/auth/signup/verify`   | `{ token }`                              | 200 `{ email }` | Checks without consuming. Errors: `SIGNUP_TOKEN_INVALID` / `SIGNUP_TOKEN_EXPIRED` / `SIGNUP_TOKEN_CONSUMED` (400). |
| POST   | `/api/auth/signup/complete` | `{ token, name, password }`              | 201 `{ id, email, name }` | Consumes the token, creates the user (bcryptjs hash). 409 `EMAIL_ALREADY_REGISTERED` on a race. No cookies. |
| POST   | `/api/auth/signin`          | `{ email, password, rememberMe? }`       | 200 `{ id, email, name }` + cookies | Unknown email and wrong password both → 401 `INVALID_CREDENTIALS`. Sets `accessToken` (JWT, 15 min, path `/api`) and `refreshToken` (opaque, path `/api/auth/refresh`); both `httpOnly`, `SameSite=Lax`, `secure` in prod. Refresh TTL 30 d with `rememberMe`, else 1 d. |
| POST   | `/api/auth/refresh`         | refresh cookie                           | 200 `{ id, email, name }` + cookies | Rotates the refresh token (new row inherits `rememberMe`). Replaying a revoked token → all of the user's sessions revoked + 401 `REFRESH_TOKEN_REUSED`. |
| POST   | `/api/auth/logout`          | refresh cookie (if the client sends it)  | 204 | Revokes the mapped DB row when present; always clears both cookies (idempotent). |
| GET    | `/api/auth/me`              | access-token cookie                      | 200 `{ id, email, name }` | Passport-JWT guard with a cookie extractor. 401 `UNAUTHENTICATED` otherwise. |
| GET    | `/api`                      | —                                        | 200 `Hello World!` | Trivial health route. |

Refresh/signup tokens are stored sha256-hashed; `expiresAt` fields carry TTL
indexes so Mongo purges stale rows automatically. Dev email goes to MailPit
(SMTP `localhost:1025`, UI <http://localhost:8025>), and the signup link is
always logged to the backend console as well.

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
│   └── shared/            # @app/shared — Zod schemas + DTO types (tsup → ESM + CJS + .d.ts)
├── compose.yaml           # local MongoDB (mongo:8) + MailPit (axllent/mailpit)
├── pnpm-workspace.yaml
└── turbo.json             # task pipeline: build → dev → lint → test
```

Both apps consume the shared library as `"@app/shared": "workspace:*"`, so request/response types are defined once and stay in sync between client and server.
