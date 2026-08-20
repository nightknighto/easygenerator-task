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

### Step 4 — frontend

- Complete auth UI implemented by the AI agent from the author's explicit
  spec (routes, API client, session handling, pages, Tailwind styling,
  Vitest/RTL suite). All technology choices (TanStack Router/Query,
  React Hook Form + shared Zod schemas, hand-rolled Tailwind UI) were the
  author's, decided up front.
- Vite proxy wiring (`BACKEND_PORT` via `loadEnv` on the repo-root `.env`),
  README frontend/routes/tests sections and this changelog drafted by the
  agent; quality gates (root build/lint/test, dev-server + proxy smoke
  through the real backend on :3100) collected as evidence by the agent.

### Step 5 — API docs

- Swagger UI (`/api-docs`) implemented by the AI agent. The generation
  direction ("@nestjs/swagger + zod bridge") was the author's pick from
  agent-presented options; the concrete bridge — zod v4's native `.meta()` +
  `nestjs-zod`'s `createZodDto` — was found and verified by the agent.
- Shared schema files enriched with OpenAPI metadata (titles, descriptions,
  examples) and the controller annotated end to end by the agent; the author
  ran the UI and reviewed the spec output.

### Step 6 — backend E2E tests

- The whole E2E suite built by the AI agent from an explicit recipe: jest
  setup pinning a hermetic env, the in-process supertest harness, the MailPit
  token-fetch helper, a small path-aware cookie jar, and four spec files
  (health, signup walk + failure modes, signin, session: /me + refresh +
  logout). The author reviewed the coverage list against the task spec and
  re-ran the suite against the live containers.
- README testing section, the `test:e2e` script/turbo task wiring and this
  changelog entry drafted by the agent; the author verified the unit suite
  and lint/build stayed green.

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

### Step 4 — frontend

- File-based routing with `@tanstack/router-plugin` was smooth once the
  plugin order was right (`TanStackRouterVite()` must come before `react()`).
  Chicken-and-egg on first build: `pnpm build` runs `tsc -b` before Vite, and
  `routeTree.gen.ts` does not exist yet — bootstrapped by running
  `vite build` once, then committing the generated file so CI never depends
  on generation order.
- Testing the REAL route tree (`createRouter` + memory history + the
  generated `routeTree` import) instead of rendering isolated components
  paid off: beforeLoad guards, `redirect` search params and post-login
  navigation are all exercised for real, with only the API module mocked.
- Deriving the live password hints from the shared `passwordSchema` itself
  (parse `''` to enumerate every rule message, then diff against the
  candidate's Zod issues) kept the requirement list single-sourced — zod v4
  aggregates all failing string checks, which makes this work.

### Step 5 — API docs

- No third-party bridge needed: zod v4 ships `.meta()` for OpenAPI metadata
  and `toJSONSchema`, and `createZodDto` from `nestjs-zod/dto` exposes the
  `_OPENAPI_METADATA_FACTORY()` hook `@nestjs/swagger` already calls. The
  classic `@anatine/zod-openapi` route is zod-3-only — verifying the
  installed versions before writing code avoided that dead end.
- A hermetic spec test (document built in-process, controllers' services
  mocked — no Mongo, no HTTP) asserts every path is documented, components
  come from the shared schemas with real constraints (`minLength` etc.), and
  no `$ref` dangles. Cheap enough to keep in the normal `pnpm test` run.

### Step 6 — backend E2E tests

- In-process supertest over `Test.createTestingModule(AppModule)` with
  `cookie-parser` and the `api` prefix applied to mirror `main.ts` — no
  listening port, so the suite coexists with the dev servers, and the routes
  under test are exactly the production ones.
- Hermetic env via a jest `setupFiles` script that sets `process.env` before
  `AppModule` is imported: `@nestjs/config` layers env files UNDER process.env
  (dotenv never overrides pre-set keys), so swapping only the database name in
  `MONGODB_URI` reliably redirects the run to `easygenerator_e2e` while the
  root `.env` still supplies host/credentials/SMTP. Verified mid-run with
  mongosh (dev DB untouched) and after the run (e2e DB empty).
- Replaying `Set-Cookie` headers through a tiny path-aware cookie jar instead
  of a library: the tests themselves prove the `/api` vs `/api/auth` scoping
  the backend promises, and single-cookie replays make the rotation/reuse
  scenarios explicit.
- Unique `e2e-<uuid>@example.com` addresses per test made everything
  order-independent and re-runnable against the shared MailPit/Mongo
  catchers from the first run.
- Asserting revocation state through the app's own Mongoose models (fetched
  from the DI container) kept the reuse-canary and logout tests honest
  without extra fixtures or a direct driver.

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
  install` fixed the tsup dts build. (The equivalent frontend install linked
  `@app/shared` correctly on the first try this time.)

### Step 4 — frontend

- Open-redirect hardening gotcha: TanStack Router's `validateSearch` MERGES
  its result over the raw search (it cannot strip unknown keys), so a
  `?redirect=https://evil.example` value still reaches the component even
  when validation returns `{}`. Fixed at the point of consumption — the
  sign-in page re-checks the target is an in-app path (`/…`, not `//…`)
  before handing it to `navigate`. Caught by a test, not by eyeballing.
- oxlint's `react/only-export-components` flagged every route file that
  declared local components next to the exported `Route`; restructured into
  thin route files (options + `beforeLoad` only) with pages in `src/pages/`,
  which also removed the earlier double-logout bug (mutation + signOut helper
  both calling `POST /api/auth/logout`).
- React Compiler lint flagged React Hook Form's `watch()` as an
  incompatible-library API; switched the live password hints to
  `useWatch({ control })` — same behavior, compiler-friendly.
- First full-router test run failed 10/31 with empty `<body>`s: sync RTL
  queries raced RouterProvider's async initial commit. Fixed once in the
  `renderApp` helper (wait for first paint) rather than sprinkling `findBy`
  through every test.

### Step 5 — API docs

- The spec test earned its keep immediately: the first controller pass had
  `@ApiOkResponse`/`@ApiBadRequestResponse` but no `@ApiBody` decorators, so
  all four request DTOs were silently absent from `components` — the test
  flagged it before anything shipped.
- Live check caught a double-prefix bug: the generated paths already include
  the global `api` prefix (SwaggerModule reads it from the adapter), so an
  initial `.addServer('/api')` would have made try-it-out call
  `/api/api/...`. Removed; `servers: []` falls back to relative URLs.
- pnpm 11 flagged `@scarf/scarf` (a transitive telemetry postinstall);
  denied it via `allowBuilds: { '@scarf/scarf': false }` instead of letting
  it run.
- Process note: the delegated subagent hit an AI-usage limit halfway
  (deps installed, DTO wrappers and `.meta()` enrichment written, nothing
  wired). Rather than redo it, the half-done work was reviewed first and
  then built upon — reviewing beats reverting working code.

### Step 6 — backend E2E tests

- The recipe's MailPit endpoint was wrong: `/api/v1/messages?to=<email>`
  silently IGNORES the `to` query param (verified against the running
  container — it returned all messages). The helper uses
  `/api/v1/search?query=<email>` plus an exact `To`-header match instead,
  which the unique per-test addresses make precise.
- `dropDatabase()` in afterAll wasn't actually final: Mongoose builds indexes
  asynchronously after connect, so a late index build re-created empty
  collections AFTER the drop. `close()` now awaits `Model.init()` for every
  registered model before dropping; re-verified the e2e database ends the
  run with zero collections.
- Relative-import depth bit once — `helpers/` sits one level deeper than the
  spec files, so `../src/…` had to be `../../src/…` in the harness. Caught by
  the first failing run (module-not-found), fixed in the helper, not worked
  around with a `moduleNameMapper`.
- Deliberate scope call: after logout, a refresh attempt with the revoked
  cookie returns `REFRESH_TOKEN_REUSED` (any revoked row trips the canary),
  not a dedicated "logged out" code. That matches the "revoked token
  presented again" semantics, so the test pins the 401 without over-coupling
  to the code — noted here rather than changing app behavior.
- The Nest CLI scaffold's `app.e2e-spec.ts` applied the global prefix but NOT
  `cookie-parser`; any cookie-based test would have silently seen `undefined`
  cookies. The harness mirrors `main.ts` fully, which is the whole point of
  an e2e suite.
