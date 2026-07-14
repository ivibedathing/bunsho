# Bunsho 文書

Open source, self-hosted authoring and control for the documents quality and compliance
programs run on — policies, SOPs, work instructions, standards. **Git inside, Google-Docs
outside.**

See [PRD.md](./PRD.md) for the full product definition and [ROADMAP.md](./ROADMAP.md) for
sequencing. `PRD.md` is the source of truth.

> **Status: v1 (feature-complete).** Phase 1 milestones M0–M7 are implemented: scaffold, auth +
> RBAC + tamper-evident audit spine, the TipTap editor, versioning/lifecycle, search + dashboard,
> suggestion-only AI, git/Markdown export + import + starter templates, and release packaging
> (one-command Compose, ghcr.io image on tag). Next: dogfood the author's real document set.
>
> **Install & operate:** see [docs/INSTALL.md](./docs/INSTALL.md).

## Stack

Next.js (TypeScript, standalone) · PostgreSQL · Prisma · Auth.js (NextAuth v5) · TipTap 2.x
(pinned) · pg-boss · Anthropic SDK · isomorphic-git · jszip · markdown-it · Biome · Vitest — one
deployable image plus Postgres, nothing else (PRD §8).

## AI assistance

Suggestion-only and **off by default** — set `ANTHROPIC_API_KEY` to enable (model `claude-opus-4-8`,
override with `AI_MODEL`; force-off with `AI_ENABLED=false`). Summary and review call the Anthropic
API; staleness and broken-reference checks are deterministic (no LLM). Nothing mutates a document
until a human accepts a suggestion. Scheduled checks run via pg-boss when `AI_SCHEDULED_CHECKS=true`
(+ `AI_SCAN_CRON`); on-demand checks run inline.

## Auth

Auth.js v5 with **JWT sessions** — Credentials plus an optional generic **OIDC** provider (set
`OIDC_*` in `.env` to enable; be a client to the org's IdP, never host one). No adapter tables:
the token only identifies the user, while role and active-status are resolved fresh from the DB on
every request, so an Admin deactivating a user or changing a role takes effect immediately. First
run sends you to `/setup` to create the admin; that creation is the genesis entry of the audit
chain. Requires `AUTH_SECRET` (`openssl rand -base64 32`).

Verify the audit chain any time:

```bash
pnpm verify-audit   # walks every org's hash chain; non-zero exit if any link is broken
```

## Develop

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

Common scripts:

| Command | Does |
|---|---|
| `pnpm check` | Lint + typecheck + test (what CI gates on) |
| `pnpm db:migrate` | Create/apply a migration in development |
| `pnpm db:deploy` | Apply existing migrations (prod/CI) |
| `pnpm build` | Production Next.js build |

## Run the whole thing (two services)

```bash
docker compose up --build
```

Brings up Postgres, applies migrations via a one-shot `migrate` job, then starts the app on
[http://localhost:3000](http://localhost:3000). Liveness at `GET /api/health`.

## Data model

The schema is **audit-shaped from day one** — write-once records cannot be retrofitted onto
history (PRD §8). Database triggers (`prisma/migrations/*_audit_triggers`) enforce what Prisma's
schema cannot:

- **Published `document_versions` are content-immutable** — only `retiredAt` / `supersededAt`
  may still transition.
- **`audit_log` is append-only**, and `approvals` / `reviews` / `acknowledgments` are write-once
  (they ship dormant now for Phases 2–3).

## License

Apache-2.0 (code) · CC BY 4.0 (templates, when they land).
