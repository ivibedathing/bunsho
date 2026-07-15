# AGENTS.md

Guidance for AI agents working in the Bunsho repository.

## What this project is

Bunsho (文書, Japanese for "document") is an open source, self-hosted tool for authoring and controlling quality/compliance documents — "git inside, Google-Docs outside." See `PRD.md` for the full product definition, scope, architecture, and rationale.

## Source of truth

- **`PRD.md` is the living source of truth.** Read it before proposing anything. Propose changes by editing the relevant section, and record every settled decision in the §11 Decision log with a date and rationale.
- **This is a PRD-driven project. Do not write application code until the user explicitly says so.** The current phase is specification, not implementation.

## Model roles

- **Advisor / planning / review: Fable 5** (`claude-fable-5`). Use for ideation, critique, architecture discussion, and reviewing proposals before they land.
- **Implementation: Opus 4.8** (`claude-opus-4-8`). Use for writing code, migrations, and concrete changes once implementation is authorized.

When delegating, route advisory/planning subagents to Fable 5 and implementation subagents to Opus 4.8.

## Conventions

- Match the existing document's register: plain, precise, no filler.
- Keep the smallest-possible-footprint principle in mind — two services (app + Postgres), nothing else (see PRD §4.5, §8).
- AI features are suggestion-only by design; never propose flows where AI publishes, deletes, or mutates documents directly.
- When the stack lands, it is: Next.js (TypeScript) single image · PostgreSQL · Prisma · pg-boss · Auth.js · TipTap · isomorphic-git (PRD §8).

## Tests

Two suites (PRD §11, 2026-07-15):

- `pnpm test` — unit. Pure logic, no infrastructure.
- `pnpm test:db` — integration (`src/**/*.db.test.ts`). Needs Postgres (`docker compose up db`).
- `pnpm test:all` / `pnpm coverage` — both.

Bunsho's core guarantees are database triggers — the append-only audit log, frozen
published versions, one draft per document — so **business logic in `src/lib` is tested
against a real Postgres, never a mocked Prisma**. A mock cannot exercise any of them.

Integration tests run on a scratch database (`TEST_DATABASE_URL`, default `bunsho_test`),
created and migrated automatically, `TRUNCATE`d between tests. Never point them at a real
database — a guard in `src/test/env.ts` refuses names that don't look like scratch. Fixtures
and helpers live in `src/test/db.ts`; `src/lib/lifecycle.db.test.ts` is the style exemplar.

When a test fails, decide whether the assumption or the product is wrong before touching
either. Never weaken a test to make a real bug pass.
