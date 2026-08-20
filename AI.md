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

## Prompts & approaches that worked

### Step 1 — scaffolding

- Delegating mechanical scaffolding to the AI agent with an explicit recipe
  (target layout, exact CLI flags, verification steps) worked well: each
  scaffolder ran non-interactively and the agent adapted when CLIs differed
  from the recipe (e.g. `@nestjs/new` -> `@nestjs/cli new`; `turbo init` no
  longer exists in turbo 2.x, so `turbo.json` was authored manually).

## What I corrected or reworked

### Step 1 — scaffolding

- Cleaned the Vite react-ts template demo (removed `App.css`, `src/assets`,
  unused `public/icons.svg`) and replaced it with a minimal Tailwind-powered
  component to prove the Tailwind v4 pipeline compiles.
- pnpm 11 blocked `esbuild`/`unrs-resolver` postinstall scripts; approved them
  via `allowBuilds` in `pnpm-workspace.yaml` so installs stay non-interactive.
