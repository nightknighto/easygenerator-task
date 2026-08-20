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
