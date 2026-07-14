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
