<div align="center">

<img src="brand/bunsho-icon.svg" alt="Bunsho logo" width="96" height="96" />

# Bunsho <sub><sup>文書</sup></sub>

**Self-hosted document control that writers and auditors can both live with.**

Git inside, Google-Docs outside.

[![CI](https://github.com/ivibedathing/bunsho/actions/workflows/ci.yml/badge.svg)](https://github.com/ivibedathing/bunsho/actions/workflows/ci.yml)
[![Release](https://github.com/ivibedathing/bunsho/actions/workflows/release.yml/badge.svg)](https://github.com/ivibedathing/bunsho/actions/workflows/release.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/ivibedathing/bunsho/badge)](https://scorecard.dev/viewer/?uri=github.com/ivibedathing/bunsho)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

</div>

---

Compliance-document tooling makes you pick a side. Docs-as-code gives you real version control that auditors can't read and writers won't touch. GRC suites give you approval workflows wrapped around an editor nobody wants to open, and an export button that returns a zip of PDFs.

Bunsho takes the underneath from one and the surface from the other. Writers get a normal editor with tables, images, and diagrams. Underneath, every published version is frozen with a content hash, every consequential action is written to a tamper-evident log, and the whole library projects out to plain Markdown in a git repo that rebuilds byte-for-byte. No git vocabulary appears anywhere in the UI.

Your QMS ends up as a folder of Markdown you can walk away with.

> **Status: v1, feature-complete and dogfooding.** Install and operate it with **[docs/INSTALL.md](./docs/INSTALL.md)**.

## Quick start

Requires Docker.

```bash
git clone https://github.com/ivibedathing/bunsho.git
cd bunsho
docker compose up --build
```

Postgres comes up, a one-shot job applies migrations, and the app starts on [localhost:3000](http://localhost:3000). The first run sends you to `/setup` to create the admin account — that account's creation is the genesis entry of the audit chain. Tagged releases are published to `ghcr.io`.

## What you get

**A real editor.** TipTap WYSIWYG with first-class tables, inline images, file attachments, and embedded draw.io diagrams that work with no external network. Autosave. It feels like a docs app because it is one.

**A lifecycle worth defending.** Draft → Published → Retired. Editing a published document forks a new draft and never disturbs what's live. Publishing is an explicit act that freezes an immutable integer version, its Markdown, and its SHA-256. Word-level diffs between any two versions, one-click restore-as-draft, and an auto-maintained change-log table.

**Evidence, not vibes.** The audit log is append-only and SHA-256 hash-chained, enforced by database triggers rather than good intentions — `pnpm verify-audit` walks every chain and exits non-zero if a single link is broken. Published versions are content-immutable at the database layer.

**Export you can actually leave with.** A one-way git/Markdown projection where re-running the rebuild produces identical commit SHAs. Zip download, Markdown/zip import (always landing in Draft), and eight CC BY 4.0 SOC 2 starter templates.

**AI that can't touch your documents.** Off unless you set an API key. Summaries and reviews call the Anthropic API; staleness and broken-reference checks are deterministic and need no key at all. Everything lands in a queue a human must accept — the AI module physically cannot write to the database, and the audit log always names the human who approved.

**Two services. That's the whole deployment.** One image plus Postgres. No Redis, no search cluster, no queue broker — Postgres does full-text search and background jobs.

## Development

Requires Node 22+, pnpm 10, and Docker.

```bash
pnpm install
cp .env.example .env

docker compose up -d db   # Postgres is the only external service
pnpm db:deploy            # apply migrations
pnpm dev                  # localhost:3000
```

| Command | Does |
|---|---|
| `pnpm check` | Lint + typecheck + test — what CI gates on |
| `pnpm db:migrate` | Create and apply a migration in development |
| `pnpm build` | Production build |
| `pnpm verify-audit` | Walk every org's audit chain; non-zero exit if broken |

**Stack:** Next.js (TypeScript, standalone) · PostgreSQL · Prisma · Auth.js v5 · TipTap 2.x (pinned) · pg-boss · Tailwind v4 · isomorphic-git · Biome · Vitest.

Two things worth knowing before you write code: the database enforces the invariants the ORM can't, so read the trigger migrations in `prisma/migrations/` before the TypeScript — and every audit append must run inside a transaction, or you will silently fork the hash chain. Both are covered in [CLAUDE.md](./CLAUDE.md).

## Documents

| Document | What it is |
|---|---|
| [docs/INSTALL.md](./docs/INSTALL.md) | Install, upgrade, backup, audit verification |
| [DECISIONS.md](./DECISIONS.md) | Dated decision log — why the code is the way it is |
| [CLAUDE.md](./CLAUDE.md) | Architecture, invariants, and footguns; guidance for contributors and AI agents |
| [SECURITY.md](./SECURITY.md) | Reporting a vulnerability |

## License

[Apache-2.0](./LICENSE) for code · CC BY 4.0 for the starter templates.
