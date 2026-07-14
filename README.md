<div align="center">

<img src="brand/bunsho-icon.svg" alt="Bunsho logo" width="96" height="96" />

# Bunsho <sub><sup>文書</sup></sub>

**Open source, self-hosted authoring and control for the documents quality and compliance programs run on** — policies, SOPs, work instructions, standards.

*Git inside, Google-Docs outside.*

[![CI](https://github.com/ivibedathing/bunsho/actions/workflows/ci.yml/badge.svg)](https://github.com/ivibedathing/bunsho/actions/workflows/ci.yml)
[![Release](https://github.com/ivibedathing/bunsho/actions/workflows/release.yml/badge.svg)](https://github.com/ivibedathing/bunsho/actions/workflows/release.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-D9BE82.svg)](PRD.md)

[Quick start](#-quick-start) · [Features](#-features) · [Development](#-development) · [Architecture](#-architecture) · [Docs](#-project-documents)

</div>

---

> **Status: v1 — feature-complete.** Phase 1 milestones M0–M7 are implemented: scaffold, auth + RBAC + tamper-evident audit spine, the TipTap editor, versioning/lifecycle, search + dashboard, suggestion-only AI, git/Markdown export + import + starter templates, and release packaging. Next: dogfooding with a real document set. Install & operate: **[docs/INSTALL.md](./docs/INSTALL.md)**.

## Why Bunsho?

Compliance document tooling usually forces a choice: a docs-as-code git repo that auditors and non-engineers can't use, or a GRC suite that writers hate. Bunsho refuses the trade-off — a fast, friendly editor in front, an audit-ready, deterministic record underneath. No git vocabulary anywhere in the UI.

## ✨ Features

- 📝 **Editor-first** — TipTap WYSIWYG with first-class tables and autosave; writing feels like a docs app, not a form
- 🔁 **Real lifecycle** — Draft → Published → Retired; editing a published doc forks a new draft, publishing is an explicit act that freezes an immutable integer version
- 🪪 **Audit-ready by construction** — append-only, SHA-256 hash-chained audit log; `pnpm verify-audit` proves the chain end-to-end
- 🔍 **Search & dashboard** — Postgres full-text search with role-aware results; home view with library stats
- 📜 **Versioning you can defend** — frozen Markdown + content SHA per version, word-level diffs, one-click restore-as-draft, auto change-log table
- 🤖 **Suggestion-only AI** — off by default; summaries, reviews, staleness and broken-reference checks land in a queue a human must accept — AI never mutates a document
- 📦 **Deterministic export** — one-way git/Markdown projection with byte-identical rebuilds, zip download, Markdown/zip import (always to Draft), SOC 2 starter templates
- 🔐 **Auth & RBAC** — Auth.js v5 (credentials + optional OIDC SSO), Admin/Editor/Viewer roles resolved fresh on every request
- 🐳 **Smallest possible footprint** — exactly two services: one Docker image + PostgreSQL. No Redis, no search cluster, nothing else

## 🚀 Quick start

Requires Docker.

```bash
git clone https://github.com/ivibedathing/bunsho.git
cd bunsho
docker compose up --build
```

Brings up Postgres, applies migrations via a one-shot `migrate` job, then starts the app on [http://localhost:3000](http://localhost:3000). First run sends you to `/setup` to create the admin account — that creation is the genesis entry of the audit chain. Liveness at `GET /api/health`.

Tagged releases are also published to GitHub Container Registry (`ghcr.io`). See [docs/INSTALL.md](./docs/INSTALL.md) for configuration, upgrades, backups, and audit verification.

## 🛠 Development

Requires Node 22+, pnpm 10, and Docker.

```bash
pnpm install
cp .env.example .env

# start Postgres (the only external service)
docker compose up -d db

# apply migrations, then run the dev server
pnpm db:deploy
pnpm dev            # http://localhost:3000
```

| Command | Does |
|---|---|
| `pnpm check` | Lint + typecheck + test (what CI gates on) |
| `pnpm db:migrate` | Create/apply a migration in development |
| `pnpm db:deploy` | Apply existing migrations (prod/CI) |
| `pnpm build` | Production Next.js build |
| `pnpm verify-audit` | Walk every org's audit hash chain; non-zero exit if any link is broken |

## 🏗 Architecture

**Stack:** Next.js (TypeScript, standalone) · PostgreSQL · Prisma · Auth.js (NextAuth v5) · TipTap 2.x (pinned) · pg-boss · Tailwind CSS v4 · motion · Anthropic SDK · isomorphic-git · jszip · markdown-it · Biome · Vitest — one deployable image plus Postgres, nothing else ([PRD §8](./PRD.md)).

### Data model

The schema is **audit-shaped from day one** — write-once records cannot be retrofitted onto history. Database triggers (`prisma/migrations/*_audit_triggers`) enforce what an ORM schema cannot:

- **Published `document_versions` are content-immutable** — only `retiredAt` / `supersededAt` may still transition
- **`audit_log` is append-only**, and `approvals` / `reviews` / `acknowledgments` are write-once (they ship dormant now, for Phases 2–3)

Independently of the triggers, every audit entry is SHA-256 hash-chained (`hash = sha256(prevHash ‖ canonical(row))`), so tampering is detectable even if a trigger were bypassed.

### AI assistance

Suggestion-only and **off by default** — set `ANTHROPIC_API_KEY` to enable (model `claude-opus-4-8`, override with `AI_MODEL`; force-off with `AI_ENABLED=false`). Summary and review call the Anthropic API; staleness and broken-reference checks are deterministic (no LLM). Nothing mutates a document until a human accepts a suggestion. Scheduled checks run via pg-boss when `AI_SCHEDULED_CHECKS=true` (+ `AI_SCAN_CRON`); on-demand checks run inline.

### Auth

Auth.js v5 with **JWT sessions** — credentials plus an optional generic **OIDC** provider (set `OIDC_*` in `.env`; be a client to the org's IdP, never host one). No adapter tables: the token only identifies the user, while role and active-status are resolved fresh from the DB on every request, so deactivating a user or changing a role takes effect immediately. Requires `AUTH_SECRET` (`openssl rand -base64 32`).

## 📚 Project documents

| Document | What it is |
|---|---|
| [PRD.md](./PRD.md) | The living source of truth — product definition, scope, architecture, decision log |
| [ROADMAP.md](./ROADMAP.md) | Milestone sequencing (M0–M7 shipped) and later phases |
| [docs/INSTALL.md](./docs/INSTALL.md) | Install, upgrade, backup, and audit-verification guide |
| [AGENTS.md](./AGENTS.md) | Guidance for AI agents working in this repository |

## 📄 License

[Apache-2.0](./LICENSE) (code) · CC BY 4.0 (starter templates).
