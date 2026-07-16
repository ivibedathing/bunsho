# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Bunsho (文書) is a self-hosted tool for authoring and controlling quality/compliance documents — "git inside, Google-Docs outside." One Next.js image plus Postgres, nothing else. Phase 1 (M0–M7) is feature-complete and dogfooding is next.

`DECISIONS.md` holds the dated decision log, the roles, and the permission matrix — it is the record of *why*, and source comments cite it by name. Append settled decisions there with a date and rationale.

When delegating, route advisory/planning/review subagents to **Fable 5** (`claude-fable-5`) and implementation subagents to **Opus 4.8** (`claude-opus-4-8`).

## Commands

```bash
pnpm install                 # postinstall runs `prisma generate`
docker compose up -d db      # Postgres is the only external service
pnpm db:deploy               # apply migrations, then:
pnpm dev                     # http://localhost:3000

pnpm check                   # lint + typecheck + unit tests — what CI gates on
pnpm test                    # unit project only (pure logic, no infrastructure)
pnpm test:db                 # integration project — needs a real Postgres
pnpm test:all                # both projects
pnpm db:migrate              # create/apply a migration in development
pnpm verify-audit            # walk every org's audit hash chain; non-zero exit if broken
```

Single test: `pnpm vitest run --project unit src/lib/audit/hashChain.test.ts`, or add `-t "name"`. Note `pnpm check` runs **unit only** — run `pnpm test:db` yourself before claiming a lifecycle/audit change works. CI runs both projects, plus `pnpm build` and a migrations-apply job against a clean Postgres 17.

Vitest collects only `src/**/*.{test,spec}.ts` — a `.tsx` test is silently ignored. The split is by filename: `*.db.test.ts` is integration, everything else is unit.

`predev`/`prebuild` run `scripts/fetch-drawio.ts`, which downloads and SHA-256-verifies a pinned draw.io release into `public/drawio/` so diagram editing works air-gapped. It exits immediately once the files exist; `DRAWIO_SKIP_FETCH=1` skips it when offline.

`pnpm dev` on port 3000 reads the dev database from `.env` — never point mutating tests at it. Integration tests handle this themselves: they run against a scratch database (`TEST_DATABASE_URL`, default `bunsho_test`), created and migrated automatically and `TRUNCATE`d between tests, and a guard in `src/test/env.ts` refuses any database whose name doesn't look like scratch.

## The database is the rulebook, not Prisma

Read `prisma/migrations/*_audit_triggers/migration.sql` and `*_draft_versions/migration.sql` before the TypeScript. They enforce what an ORM schema cannot, and the schema comments point at them deliberately:

- **`audit_log` is append-only**; `approvals`/`reviews`/`acknowledgments` are write-once (dormant in v1 — they ship early because write-once evidence tables can't be retrofitted onto history).
- **Published `document_versions` are frozen** — only `retiredAt`/`supersededAt` may still change. The trigger checks `OLD.publishedAt IS NOT NULL`, so it is self-arming: the publishing write passes, every later write to that row is rejected. `DELETE` is intentionally not blocked.
- **At most one open draft per document**, via trigger rather than a partial unique index (which would show up as Prisma drift).
- **A nested page carries no folder** — `Document.parentId` is a self-relation, and a child derives its location from its root ancestor, so `folderId` must be null. A `documents_child_has_no_folder` CHECK enforces it. Both `Document` and `Folder` trees use `onDelete: Restrict`: deleting a node with children is refused rather than silently cascading a subtree away.

The triggers enforce append-only, **not hash correctness** — chain integrity is entirely application-enforced. The DB only guarantees you cannot clean up afterward.

Prisma's client is generated to `src/generated/prisma`, so import from `@/generated/prisma/client`, **not** `@prisma/client`. That directory is git-ignored and Biome-ignored.

## The audit spine

Every mutation ends in `appendAudit(tx, input)` — `src/lib/audit/writer.ts`. `hash = sha256(prevHash ‖ canonicalize(row))`, chained per-org; there is no synthetic genesis row (the first real entry is genesis, `prevHash === null` hashed as `""`).

**The footgun:** `appendAudit(prisma, …)` typechecks — `Prisma.TransactionClient` is structurally assignable from the root client — but silently destroys correctness. The per-org `pg_advisory_xact_lock` releases immediately outside a transaction, so two concurrent appends read the same `prevHash` and **fork the chain unrecoverably** (the write-once trigger blocks the repair). Always use the interactive `prisma.$transaction(async (tx) => …)` callback form; the array form yields no `tx` and cannot carry an append.

Other ways to break the chain, all uncaught by types or constraints:
- Writing `prisma.auditLogEntry.create()` directly — bypasses hashing entirely.
- Letting `createdAt` default in the DB. The writer passes its own; the hash commits to that exact ISO string.
- Storing `metadata` as JSON null instead of `PrismaNS.DbNull` — it won't round-trip and the hash won't recompute.

`seq` is deliberately not hashed (unknown at insert time); order is carried by `prevHash` linkage alone, so `seq` gaps from rolled-back transactions are harmless. The profile activity feed reads `audit_log` directly — there is no separate feed table.

## Auth, RBAC, tenancy

**There is no `middleware.ts`.** Every page and route authorizes itself; a new page that forgets `requireUser()` is silently public. This is the most important fact about the auth model and you can only learn it from an absence.

`src/lib/rbac.ts` is the whole policy surface: `getCurrentUser()` (nullable), `requireUser()` (redirects to `/signin`), `requireRole(...roles)` (redirects to `/forbidden`), `can(role, ...allowed)` (pure predicate for conditional UI). Standard server-component pattern is `const user = await requireRole("admin", "editor")`, then thread `user.orgId` into every query.

Sessions are JWT with no adapter tables (the Credentials provider can't use database sessions). **The token carries only `userId` + `orgId` — role is deliberately absent** and re-read from the DB on every `getCurrentUser()`, so deactivations and role changes take effect on the next request. Note that `src/types/next-auth.d.ts` types `Session.user.role` as non-optional `Role`, but the session callback never assigns it: reading `session.user.role` compiles clean and is **always `undefined` at runtime**. Get roles from `rbac`'s `CurrentUser`, never from the session.

API routes can't idiomatically `redirect()`, so they call `getCurrentUser()` and hand-roll 401/403 — meaning role policy is duplicated between `requireRole` and inline route checks with no shared helper. Both API routes set `export const dynamic = "force-dynamic"`, which is load-bearing: static optimization would cache an authenticated response.

Tenancy is convention, not enforcement — no RLS, no Prisma middleware. Omitting `orgId` from a `where` is a cross-tenant leak nothing will catch.

## Document lifecycle

**There is no status enum.** `documentStatus()` in `src/lib/lifecycle.ts` derives it: `retiredAt` set → retired; `currentPublishedVersionId` set → published; otherwise draft. Versions carry a richer fourth state (`superseded`) computed at the history page.

`Document` holds no content — it's a mutable container plus a `currentPublishedVersionId` projection pointer. **All content lives in `DocumentVersion`**, and drafts and published versions share that table; the discriminator is `publishedAt IS NULL`. The live editable content is the single open draft.

`getOrCreateDraft()` forks from the current published version at `version = max + 1`. It's called from the edit page's render, so merely navigating to `/documents/{id}/edit` forks a draft as a side effect of a GET. Forking and autosave are deliberately **not** audit-logged — publish is the logged event.

`publishDocument()` serializes to Markdown, freezes `contentSha = sha256(markdown)` (over the *Markdown*, not the ProseMirror JSON), supersedes the prior version, and advances the pointer, all in one transaction. The version number is claimed early (at draft creation) and frozen late. `versionMarkdown()` returns frozen Markdown for published rows and serializes on the fly for drafts — which is why drafts can be diffed and why the LLM always sees Markdown. `restoreVersion()` copies content into the open draft rather than rewriting history.

## Export determinism

`rebuildGitRepo()` wipes and replays every published version as one commit, and must produce identical commit SHAs from identical DB state. Five things make that true — preserve all of them: fixed author/committer identity (`Bunsho Export`), timestamps derived from `publishedAt` never `Date.now()`, a total commit ordering (`publishedAt, documentId, version` — the cuid tiebreaks same-instant publishes), the pinned hand-written serializer, and point-in-time change logs (only versions `<= v.version`, or every commit's content would change on every later publish). Zip export separately stamps a fixed genesis date on every entry.

Note the two exports don't agree on file set: the zip path filters out retired docs, the git path doesn't.

`src/lib/markdown/serialize.ts` (PM JSON → Markdown) is **one-way and canonical** — the editor always reloads from JSON and never re-parses this Markdown. It's hand-written because prosemirror-markdown has no GFM tables. `parse.ts` (Markdown → PM JSON) is best-effort and import-only; hard breaks don't survive a round trip. Import always lands as Draft structurally, not by a flag: `import.ts` composes `createDocument` + `saveDraft` and never imports `publishDocument`.

## AI

**`src/lib/ai/anthropic.ts` imports only the Anthropic SDK — no `prisma`, no `lifecycle`.** That module boundary *is* the "AI never mutates a document" guarantee; keep it that way and defend it in review. Suggestions land in a queue with `actorType: "ai"`, and only a human resolves them (`actingHumanId`, audited with `metadata.aiOriginated: true`).

Staleness and broken-reference checks are deterministic (no LLM) and run against every published doc; summary and review call the API. Gated by `isAiEnabled()`: the key is required, but `AI_ENABLED` is opt-*out* only, so a key with `AI_ENABLED` unset means AI is **on**. `AI_MODEL` is read once at import — changing it needs a restart.

Scheduled checks run pg-boss in-process via `src/instrumentation.ts` and are off by default (pg-boss creates its own `pgboss` schema, which would pollute Prisma drift detection). Making it work needs all three of the `NEXT_RUNTIME` guard, the dynamic `import()`, and the `next.config.mjs` webpack alias that resolves the worker to `false` on edge — plus `serverExternalPackages: ["pg-boss"]`. The runtime guard alone is not sufficient, because the edge module graph still has to resolve.

That alias is also why `dev` and `build` pass `--webpack`: Next 16 defaults to Turbopack, whose static `resolveAlias` can't express a condition on `nextRuntime`. Silencing the resulting error with an empty `turbopack: {}` would enable Turbopack and drop the alias, bringing the edge-compile failure straight back.

## Testing

**Business logic in `src/lib` is tested against a real Postgres, never a mocked Prisma.** The guarantees that make Bunsho a control system *are* the triggers — append-only audit log, frozen published versions, one draft per document, transaction rollback, org scoping. A mock asserts call shape and proves none of them, so the tests that matter most are exactly the ones a mock cannot write. `src/lib/lifecycle.db.test.ts` is the style exemplar; fixtures and helpers live in `src/test/db.ts`.

Tests `TRUNCATE` rather than `DELETE` between cases — the write-once triggers reject row deletion, and TRUNCATE doesn't fire row-level triggers, so the guarantee stays armed for the tests asserting it.

Two Prisma translation quirks worth knowing when asserting on trigger errors: a trigger raising `unique_violation` surfaces as P2002 with the trigger's message **discarded**, while `restrict_violation` is unrecognized so its message survives.

When a test fails, decide whether the assumption or the product is wrong before touching either. Never weaken a test to make a real bug pass.

## Dormant surface — don't assume the plumbing exists

The `Settings` model (`aiEnabled`, `aiScanCadence`, `aiRateLimits`, `exportRepoConfig`, `ssoConfig`) is **never read or written by any code**. It implies per-org DB-backed admin config with a safe `false` default; reality is process-global env vars with an opt-out gate. Likewise `Approval`/`Review`/`Acknowledgment` are intentionally dormant, `SuggestionOrigin.inline` has no producer, `enqueueCheckRun()` has no caller (the UI runs checks inline), several `AuditAction` values are never emitted, and the optional remote git push isn't implemented.

## Conventions

- Match the existing register: plain, precise, no filler. Biome (2 spaces, double quotes, width 100) — run `pnpm lint`, not eslint/prettier.
- AI features are suggestion-only by design. Never propose a flow where AI publishes, deletes, or mutates a document directly.
- Keep the smallest-possible-footprint principle: two services, app + Postgres. No Redis, no search cluster.
