# Installing & operating Bunsho

Bunsho runs as **exactly two services** — the app and PostgreSQL (DECISIONS.md).
The only hard external dependency is Postgres; AI features additionally need
outbound HTTPS to the Anthropic API and are off unless you enable them.

## Requirements

- Docker + Docker Compose (small installs), or the published image in
  Kubernetes/Helm (larger installs).
- ~1 vCPU / 1 GB RAM to start; storage grows with document/version history.

## Quickstart (Docker Compose)

```bash
git clone <your fork> bunsho && cd bunsho
cp .env.example .env
# 1) set a signing secret:
#    AUTH_SECRET="$(openssl rand -base64 32)"   → put it in .env
# 2) (optional) set ANTHROPIC_API_KEY to enable AI assistance
docker compose up --build     # builds the image, applies migrations, starts the app
```

Open <http://localhost:3000>. On first run you're sent to `/setup` to create the
first administrator — that action is the genesis entry of the tamper-evident
audit log.

To run the prebuilt image instead of building locally, point the `app` and
`migrate` services at `ghcr.io/<owner>/bunsho:<tag>` (published on each release
tag) rather than `build:`.

## Configuration

All configuration is environment variables — see [`.env.example`](../.env.example)
for the full list. The essentials:

| Variable | Purpose |
|---|---|
| `AUTH_SECRET` | **Required.** Signs session tokens (`openssl rand -base64 32`). |
| `DATABASE_URL` | Postgres connection (Compose sets this for you). |
| `ORG_NAME` | Name used when the first admin is created. |
| `ANTHROPIC_API_KEY` | Enables AI assistance. Unset ⇒ AI features are hidden. |
| `AI_ENABLED` | Set `false` to force-disable AI even with a key (locked-down installs). |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | Enable SSO via your IdP. |
| `AI_SCHEDULED_CHECKS` / `AI_SCAN_CRON` | Turn on scheduled staleness/reference checks (pg-boss). |
| `EXPORT_REPO_PATH` | Where "Rebuild git export" writes the one-way git repo. |

### Diagrams (draw.io)

The image bundles the draw.io editor (vendored at build time into
`public/drawio/`) and serves it same-origin, so inserting and editing diagrams
works **fully offline / air-gapped** — no connection to diagrams.net is ever
made. Two build-time knobs exist for people building their own image:
`NEXT_PUBLIC_DRAWIO_URL` points the editor at a different draw.io deployment,
and `DRAWIO_SKIP_FETCH=1` skips the vendoring download (use them together for
offline builds). Neither has any effect on the prebuilt ghcr.io image.

## Upgrading

Bunsho ships forward-only, history-preserving migrations.

```bash
git pull                       # or bump the image tag
docker compose up --build -d   # the `migrate` one-shot runs `prisma migrate deploy`
```

The `migrate` service applies any new migrations **before** the app starts, so a
plain `docker compose up` performs the schema upgrade. Immutable published
versions and the audit log are never rewritten by a migration.

## Backups

Everything canonical lives in Postgres — back it up:

```bash
docker compose exec db pg_dump -U bunsho bunsho > bunsho-$(date +%F).sql
```

The git/Markdown export ("Rebuild git export", or `Download .zip`) is a portable,
human-readable secondary copy of all published content — your QMS is a folder of
Markdown you can walk away with.

## Verifying the audit trail

The append-only audit log is a SHA-256 hash chain. Verify it any time via the
`migrate` service image (which carries the toolchain; the app image is minimal):

```bash
docker compose run --rm migrate pnpm verify-audit    # dev: pnpm verify-audit
```

A non-zero exit means a chain was broken — useful as a scheduled integrity check.

## Health

`GET /api/health` is a liveness probe (used by the container healthcheck and any
load balancer / Kubernetes probe).
