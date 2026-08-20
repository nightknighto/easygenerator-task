# AI.md

## What was AI-assisted

Every step of the task was AI-assisted, from scaffolding to E2E tests. I (the human author) did not write a line of code in this task, except for a tiny fix. I only acted as the architect, deciding on the technology stack, the layout of the monorepo, the explicit recipes for each step, and taking all the high-level decisions. I also glanced at the AI's output to ensure it matched my expectations.

For deeper details, the rest of this section is written by the AI agent, which describes how the project was built step by step, and in each step, what I (the author) asked it to do, and what it produced.

The rest of the sections are manually written, so feel free to jump to them if you want to skip the AI's perspective.

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

- Step-by-step approach: Instead of asking the AI to generate the entire project in one go, I broke it down into smaller steps (scaffolding, MongoDB integration, backend auth module, frontend, API docs, backend E2E tests). This allowed me to have deeper control over the process and decision-making at each stage, and also made it easier to review and verify the AI's output.

- Owning all decisions: I explicitly told the AI that all technical decisions must go through me, and that it must present the possible approaches as options for me to choose from. Paired with the step-by-step approach, this ensured that the final output aligned with my vision and requirements.

- AI brainstorming: To speed up the technical decision-making process, I use a brainstorming skill that makes the AI generate a list of possible approaches for each technical decision, comparing their pros and cons, then I choose the one that best fits my needs. This allowed me to make informed decisions quickly and efficiently. I'm also able to steer the AI towards my preferred approach by providing feedback on the options it presents.
  - **Note**: Even though AI presented me with great options at each decision point, due to my experience, I was able to come up with better approaches that the AI did not consider. Some examples of this are:
    - The technical stack and the monorepo layout
    - The 3-way email-link signup flow
    - Using mailpit container for local email testing

- Subagent-driven development: I instructed the AI agent to rely on launching subagents for the code implementation of each task. This allowed the main AI to act as a project manager and coordinator, keeping track of the overall progress, the instructions, and the quality of the output. It also prevented context loss, bloating, and ensured that the AI's output was consistent with my requirements.
> In bigger projects, I would also create AGENTS.md and use it to save instructions and context across AI sessions.

### Example Prompt

This is the first prompt starting the project:

```
$brainstorming
Given [Full_Stack_Test_Task.md](./Full_Stack_Test_Task.md) , we are to take this step by step. All decisions and technical choices should be MINE. Your mission is to brianstorm and suggest the available approaches whenever there are choices to be made.

If we can, let's try to have this chat as the central orchestrator for the whole task. Meaning, prefer delegating technical work to subagents whenever possible, so we can keep using this chat without getting context bloat.

Step 1: scaffolding frontend and backend projects
Create a monorepo (pnpm workspace or turbo, whichever you see better) with a Vite React TypeScript Tailwind frontend project, NestJS TypeScript backend project (mongodb not now), and a shared library to be used for sharing request-response DTOs later.

Use deterministic scaffolding commands whenever possible instead of manually creating the boilerplate. Vite and NestJS already have ones, turbo idk, but maybe
```

Full AI conversation can be shared live with the recruiter if desired.

## What I corrected or reworked

The approaches I used above allowed me to catch and correct issues or deviations early in the planning and decision-making stages, before they affected the code implementation. This saved time and effort  (and tokens), as I was able to avoid having to rework large portions of code later on.

The AI agent was able to test the code it generated due to the test suites, and run a browser to verify the frontend and the end-to-end flows, leading to AI self-correction before announcing the output to me.

