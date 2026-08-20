# AI.md

Working notes for this repository: what was AI-assisted, what worked, and what
was reworked. Maintained as work progresses.

## What was AI-assisted

### Step 1 — scaffolding

- Monorepo scaffolded via official scaffolders (`create-vite`,
  `@nestjs/cli new`, turbo) orchestrated by an AI agent (ZCode).
- The author made all technology decisions (pnpm + turbo, apps/packages
  layout, tsup-built shared package) from AI-presented options.
- Root `README.md` drafted by the AI agent from the actual verified commands
  and repo layout; reviewed by the author.

### Step 2 — MongoDB integration

- Root `compose.yaml` (mongo:8 service, healthcheck, named volume) and
  `.env`/`.env.example` authored by the AI agent from an explicit recipe;
  author reviewed and made the local-dev-only values call.
- Backend wiring (ConfigModule with a fail-fast `MONGODB_URI` check,
  `MongooseModule.forRootAsync`, connection logging via the Nest Logger)
  drafted by the agent; author verified by booting the stack end to end.

### Step 3 — backend auth module

- Full auth module implemented by the AI agent from the author's explicit spec
  (3-step email-link signup, anti-enumeration, cookie sign-in with rotating
  DB-backed refresh tokens, refresh-reuse canary, passport-jwt `/me`).
- Shared Zod schemas (`@app/shared`), MailPit compose service, env additions,
  README auth-flow table and this changelog drafted by the agent; author
  reviewed the spec decisions were implemented verbatim.

## Prompts & approaches that worked

### Step 1 — scaffolding

- Delegating mechanical scaffolding to the AI agent with an explicit recipe
  (target layout, exact CLI flags, verification steps) worked well: each
  scaffolder ran non-interactively and the agent adapted when CLIs differed
  from the recipe (e.g. `@nestjs/new` -> `@nestjs/cli new`; `turbo init` no
  longer exists in turbo 2.x, so `turbo.json` was authored manually).

### Step 2 — MongoDB integration

- The explicit-recipe pattern carried over well: exact env keys, compose
  service spec, and the desired `forRootAsync` shape produced a working
  stack in one pass, with the agent collecting evidence itself
  (`compose ps` healthy, boot log "MongoDB connected", curl, `mongosh
  db.version()`).
- Loading env from `['../../.env', '.env']` so the same AppModule works with
  cwd `apps/backend` (turbo/jest) and from the repo root — avoids a
  "works in dev, breaks elsewhere" class of bug.

### Step 3 — backend auth module

- Version decision: `nestjs-zod@5` (5.5.0) supports `zod ^3.25 || ^4` and
  Nest 10/11 per its peer deps and is actively maintained (release within the
  last month at the time of writing), so it was used as-is — its
  `ZodValidationPipe` accepts the raw shared schemas, no DTO-wrapper classes
  needed. No deviation to a custom pipe.
- Keeping the Zod schemas in `@app/shared` and validating with
  `new ZodValidationPipe(SignupRequestSchema)` per route gave single-source
  validation; the global exception filter maps the resulting
  `ZodValidationException` into the `{ statusCode, code, message, details }`
  envelope with Zod issues in `details`.
- Mocking the persistence services (Users/SignupToken/RefreshToken) instead of
  the Mongo layer made the AuthService unit tests read like the spec's
  scenario list (22 tests, no DB needed).
- Walking the flow live with curl + cookie jars + the MailPit API + mongosh
  caught one real bug: Nest defaults POST to 201, but several endpoints must
  return 200 — explicit `@HttpCode` on them fixed it.

## What I corrected or reworked

### Step 1 — scaffolding

- Cleaned the Vite react-ts template demo (removed `App.css`, `src/assets`,
  unused `public/icons.svg`) and replaced it with a minimal Tailwind-powered
  component to prove the Tailwind v4 pipeline compiles.
- pnpm 11 blocked `esbuild`/`unrs-resolver` postinstall scripts; approved them
  via `allowBuilds` in `pnpm-workspace.yaml` so installs stay non-interactive.

### Step 2 — MongoDB integration

- The plan assumed the Docker daemon was down and included a launch-and-poll
  step; the engine turned out to be already running, so that step was
  skipped (noted rather than blindly followed).
- Kept `.env.example` filled with working local-dev values instead of
  placeholders so `cp .env.example .env && docker compose up -d` works out
  of the box — documented as local-dev-only in both files.

### Step 3 — backend auth module

- Spec tension found while verifying: the refresh cookie was path-scoped to
  `/api/auth/refresh` ONLY, which meant a spec-conforming browser would NOT
  attach it to `POST /api/auth/logout` — logout could clear cookies but could
  not revoke the DB row in real browser usage. Surfaced to the author, who
  decided to widen the refresh cookie path to `/api/auth` so logout receives
  it and revocation works as originally specced; the token still never
  travels to non-auth endpoints.
- `Date | null` fields in the Mongoose schemas needed an explicit
  `@Prop({ type: Date })` — the decorator can't infer union types.
- The repo's ESLint config uses type-checked rules, which fight Jest mocks;
  added a small config block relaxing `no-unbound-method`/`no-unsafe-*` for
  `*.spec.ts` files only (source files stay fully checked).
- `pnpm --filter backend add …` did not link shared's newly added `zod` dep
  into `packages/shared/node_modules`; a root `pnpm --filter @app/shared
  install` fixed the tsup dts build.
