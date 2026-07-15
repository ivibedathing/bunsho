# Bunsho — Product Requirements Document

**Status:** Draft v2 — last updated 2026-07-13 (merged the market-research PRD v1 with the internal QMS document-control PRD v0.4)

> **How to use this document.** This is the living source of truth for what Bunsho is and why. We iterate on it continuously: propose changes by editing the relevant section, and record every settled decision in the [Decision log](#11-decision-log) with a date and rationale. Sections 1–4 change rarely (vision); sections 5–10 evolve with the product; section 11 only grows.

---

## 1. Vision & thesis

**Writing controlled documents should be fun and easy.**

Bunsho (文書, "document") is an open source, self-hosted tool for authoring and controlling the documents that quality and compliance programs run on — policies, SOPs, work instructions, standards — without making anyone choose between a pleasant writing experience and an audit-ready paper trail. It replaces ad hoc storage in shared drives, wikis, and email threads with a single source of truth that has real version history.

The thesis in one line: **git inside, Google-Docs outside.** Underneath: immutable versions, an audit-shaped data model, a tamper-evident audit log, and portable Markdown you can walk away with. On the surface: a fast, friendly editor with first-class tables, a clear document lifecycle, AI assistance that suggests but never decides, and zero git vocabulary.

The first deployment is our own: Bunsho manages its author's real policy and SOP set (dogfooding) before serving anyone else.

### About the name

**Bunsho** is the Japanese word **文書** (*bunsho*) — literally "document" or "written text." It combines **文** (*bun*, "writing / sentence / literature") with **書** (*sho*, "to write / a book / document"), so the characters themselves read as "written writing": the artifact and the act of authoring it, together. That pairing is the whole product thesis in two kanji — Bunsho is where the writing *and* the controlled document are one and the same thing. In Japanese usage the term specifically connotes formal, official, or business documents (as in *公文書*, *kōbunsho*, "official/public document"), which is exactly the register Bunsho serves: policies, SOPs, standards, and the records auditors read. The name is deliberately plain — a document tool that just says "document" — matching the principle that the tooling should disappear behind the writing.

## 2. Problem & opportunity

### The internal problem

Today, SOPs and quality documents live across Google Drive, Confluence, Notion, and Slack threads, with no consistent version control or change history, no visibility into what's *current* vs. an outdated copy, no easy way for employees to find the right version, and no single place to write and maintain quality documents. This creates risk during audits (SOC 2, customer security reviews), onboarding confusion, and inconsistent process execution.

### The market opportunity

Research (July 2026, four independent research passes) found a genuinely vacant niche:

**Commercial compliance platforms treat documents as a checkbox, not a craft.** Vanta (~$10–12k/yr entry), Drata (~$7.5k), Secureframe, Sprinto et al. all ship the same policy module: templates → mediocre rich-text box or Word upload → approval chain → acknowledgment checkbox → annual reminder. The most-repeated complaint across G2 and practitioner reviews is template rigidity and painful customization ([Vanta review](https://soc2auditors.org/insights/vanta-review/), [Drata's own "common policy issues" page](https://help.drata.com/en/articles/13252508-common-policy-management-issues-in-drata-and-how-to-resolve-them), [Sprinto G2](https://www.g2.com/products/sprinto-inc/reviews?qs=pros-and-cons)). Drata makes external policy management (Confluence) *mutually exclusive* with in-app authoring. Nobody owns the writing experience.

**No open source QMS tool has ever succeeded — but open content has.** The most-starred OSS QMS tool on GitHub is [innolitics/rdm](https://github.com/innolitics/rdm) at 137★, dormant since 2022. What thrived was content: [OpenRegulatory's templates](https://openregulatory.com/) and [Tidepool's qmsOS](https://www.tidepool.org/open), which earned real ISO 13485 certification ([TÜV SÜD, 2025](https://www.businesswire.com/news/home/20250418072247/en/Tidepool-Achieves-ISO-13485-Certification-for-Open-Source-Quality-Management-System)). Lesson: **ship content with the tool.**

**The closest ancestor proved demand and then died.** [StrongDM Comply](https://github.com/strongdm/comply) — Markdown policy-as-code, 1.6k★ — has been abandoned since July 2022: no UI, no approvals, no acknowledgment tracking, Pandoc/LaTeX friction. Four years of vacant, proven demand.

**Docs-as-code QMS fails on UX, never on compliance.** Auditors accepted git-backed QMS repeatedly (NHS [GSTT-CSC template](https://github.com/GSTT-CSC/QMS-Template) survived 18 internal + 3 external notified-body audits; Innolitics clients passed 510(k)s). But OpenRegulatory — the loudest early advocate — [formally retracted the approach](https://openregulatory.com/we-no-longer-recommend-github-gitlab-as-qms-software/) for three reasons: Markdown tables become unmanageable, non-technical users can't learn git, and PR-based approval breaks under real behavior. Every failure is an interface failure.

**Trust in AI-generated compliance is damaged.** The Delve scandal ("[fake compliance as a service](https://deepdelver.substack.com/p/delve-fake-compliance-as-a-service)") makes "a human wrote and understood this, pleasantly" a credible counter-position to AI-policy-mill competitors — which is why Bunsho's AI is **suggestion-only**: it accelerates human writing, it never replaces human judgment or approval.

The opportunity: an open source, self-hostable tool that is **narrow and deep on documents** — the document-control slice done extremely well, without buying a $7.5–25k/yr GRC suite — and pleasant enough that people *want* to write in it.

## 3. Users & personas

| Priority | User | Needs |
|---|---|---|
| Now | **The author (solo dogfooding)** | Write, version, publish, and export his own policy/SOP set |
| Next | **Software companies doing SOC 2 / ISO 27001** (5–50 people, founders/engineers wearing the compliance hat) | Current-version certainty, version history, audit-ready records without a GRC platform |
| Later | **Classical QMS** (ISO 9001 / ISO 13485 / FDA QMSR) | Same core + formal approvals, Part 11-grade signatures, training records |

### Roles (v1)

| Role | Needs |
|---|---|
| **Admin** | Full control: create/deactivate users, manage roles, delete documents, view/export audit log and version history, force-retire any document, configure AI check cadence, manage deployment settings |
| **Editor** | Create and edit any document; view version history and diffs; restore prior versions; trigger and accept/reject AI suggestions |
| **Viewer** | Search and view **published, current** documents only |
| **AI agent** (system actor, not a login role) | Read access to all documents; generates summaries and draft/edit suggestions; **cannot publish, delete, or directly modify anything** — all output routes through an Editor or Admin |

**Positioning:** *a great docs tool that happens to satisfy auditors* — not a GRC suite. This markets beyond compliance (SOPs, engineering handbooks) and complements rather than competes with GRC tools (CISO Assistant, Probo).

**Anti-lock-in promise:** *your QMS is a folder of Markdown you can walk away with.* Lock-in with no clean export is the #1 structural complaint against every commercial eQMS ([Greenlight Guru ~+100% price hike](https://openregulatory.com/articles/greenlight-guru-price), [Matrix post-acquisition](https://openregulatory.com/articles/matrix-requirements-got-sold-heres-what-you-need-to-know)).

The document-control core stays **standard-agnostic**; standards arrive as template packs and checklists, not as core-model changes.

## 4. Product principles

1. **The writing experience comes first.** Editors should write as easily as in Google Docs/Notion; if the editor isn't the best part of the product, we've lost the differentiator.
2. **No git concepts in the primary UX.** Git is an export format, configured in Settings. Nobody sees "branch," "merge," or "rebase."
3. **Tables are first-class.** Wide tables are where docs-as-code QMS went to die.
4. **Audit-ready by construction, not by screenshot.** Version history, change records, and the audit log are generated as a side effect of using the product — and the schema is audit-shaped from day one even where workflow UI comes later.
5. **Smallest possible self-hosted footprint.** Two services — the app and Postgres — and nothing else. No Redis, no search cluster, no separate identity provider, no microservices. The fewer things an IT admin installs and upgrades, the better.
6. **AI suggests, humans decide.** Every AI output is a suggestion requiring explicit human acceptance; a bug or bad output can be rejected with zero risk to published documents.
7. **Ship content with the tool.** A fresh instance offers a plausible starter doc set, not an empty screen.
8. **Honest security claims.** Hash chains prove tamper-*evidence*, not tamper-*proofing*; we say so.

## 5. Goals & success metrics (first internal deployment)

| Goal | Metric |
|---|---|
| Centralize all controlled documents in one system | 100% of active SOPs migrated within [X weeks] |
| Give every document a reliable version history | 100% of edits produce a retrievable prior version |
| Reduce time to find current SOPs | Time-to-find improves; "which version?" questions in Slack drop |
| Make writing/editing easy enough for daily use | Editors create/update docs without training or workarounds |
| Catch stale/inconsistent content before it causes problems | % of AI-flagged documents addressed within [X weeks] of being surfaced |
| Deploy and run reliably self-hosted | Documented install/upgrade succeeds; no external dependency beyond the AI API |

## 6. Requirements

### Functional

| # | Requirement | Detail |
|---|---|---|
| F1 | **Document writing & editing** | Rich-text editor (TipTap) with headings, lists, links, and **first-class tables**; autosave while drafting; documents organized in folders/categories with title, owner, unique doc code (e.g. `POL-007`), type, tags, last-updated metadata |
| F2 | **Lifecycle (v1, simplified)** | **Draft → Published → Retired.** Publishing is an explicit act; editing a Published document forks a new Draft version that never disturbs the live Published version until explicitly published; Retired documents leave Viewer search but keep full history; only Admins force-retire or delete. *The schema underneath implements the full audit lifecycle (see §8) so Phase 2 approval workflows are UI, not migration.* |
| F3 | **Version control** | Every publish creates a new immutable integer version; prior versions never overwritten; version metadata: author, timestamp, optional change note; auto-maintained per-document change-log table (version, date, note, author) rendered in-app and in exports |
| F4 | **Diff & restore** | Redline/diff view between any two versions; one-click restore of a prior version — restore *creates a new version*, never deletes history |
| F5 | **Access control** | Admin / Editor / Viewer per the matrix below; every action attributed to a real user identity |
| F6 | **Search & metadata** | Full-text search (Postgres FTS) across content; filters by category, owner, status, last updated; Viewers only ever see current Published versions |
| F7 | **Audit trail** | Append-only, hash-chained log of all actions (create, edit, publish, restore, retire, user/role changes, AI suggestion accepted/rejected) with a `verify-audit` command; exportable (CSV) |
| F8 | **AI agent assistance** (suggestion-only) | (a) on-demand **summarization** of any document; (b) **writing assistance** — draft/rewrite a section as an inline suggestion the Editor edits/accepts/discards; (c) **document review** for clarity, consistency, completeness, returned as a diff (same view as F4); (d) **scheduled checks** (Admin-configurable cadence) across Published docs for staleness, broken internal references, cross-document inconsistencies; (e) **on-demand checks** on one or all documents; (f) a per-document **suggestions queue** — nothing applies until an Editor/Admin explicitly accepts; (g) accepting a suggestion creates a new version, audit-logged as AI-originated with the approving human recorded; (h) runs via the Anthropic API — read access to documents, write access limited to creating suggestions |
| F9 | **One-way git/Markdown export** | Each published version = one commit (YAML front matter + body + change-log table) to a local repo; deterministic rebuild from DB; optional remote push; zip download of the Markdown set |
| F10 | **Starter template pack** | 8–12 SOC 2-oriented policy/SOP templates offered on first run (original content, CC BY 4.0) |
| F11 | **Import (phased)** | v1: Markdown/zip file import into Draft state. v1.x: connectors for Confluence, Notion, BookStack, Jira/JSM KB — carrying title, content, structure, last-modified, and (best-effort) page history as versions; imported content lands in **Draft** for review, never auto-published; batch job with pre-commit preview; unsupported formatting (Notion blocks, Confluence macros) is flagged, never silently dropped |

### Permission matrix (v1)

| Action | Admin | Editor | Viewer |
|---|:---:|:---:|:---:|
| View published documents | ✓ | ✓ | ✓ |
| Create / edit any document | ✓ | ✓ | – |
| View version history & diffs | ✓ | ✓ | – |
| Restore a prior version | ✓ | ✓ | – |
| Delete a document | ✓ | – | – |
| Force-retire a document | ✓ | – | – |
| Create / deactivate users, change roles | ✓ | – | – |
| View/export audit log | ✓ | – | – |
| Trigger AI summary / review / on-demand check | ✓ | ✓ | – |
| Accept or reject an AI suggestion | ✓ | ✓ | – |
| Configure scheduled AI check cadence | ✓ | – | – |
| Manage deployment settings (env, upgrades, backups) | ✓ | – | – |

### Non-functional

- **Security:** SSO via OIDC/SAML (be a client to the org's existing IdP, don't host one) plus local credentials fallback; encryption in transit; RBAC everywhere.
- **Deploy:** two services — one app image + Postgres — via Docker Compose (small installs) or the same image in Kubernetes/Helm (larger ones); configuration via env vars/config file; documented install and upgrade with safe, versioned schema migrations that preserve history; org owns backups and uptime.
- **AI data handling:** document content sent to the AI stays within approved API/data-processing terms; no training on our content; AI features require outbound HTTPS to the Anthropic API — must be explicitly allowed (and must be cleanly disableable for locked-down deployments).
- **AI cost/reliability:** scheduled scans batch and respect configurable rate/cost limits; agent output is always a suggestion — zero risk to published documents.
- **Determinism & portability:** frozen Markdown renders and export rebuilds are byte-identical; canonical draft format is ProseMirror JSON, released format is Markdown + YAML front matter; no dependency on any cloud vendor's proprietary services.
- **Data retention:** retired documents and full version history retained indefinitely (or per policy).
- **Availability:** 99.9% uptime target for the internal deployment.

## 7. v1 scope

**Guiding rules: the schema is audit-shaped from day one (write-once records can't be retrofitted), the UI ships the simplest lifecycle that makes the tool a daily writing home, and AI assistance is part of v1 because "fun and easy" is the product.**

**IN (v1):** document repository with folders/categories · TipTap editor with tables + autosave · Draft → Published → Retired lifecycle · immutable integer versions + change notes + auto change-log table · diff/restore · Admin/Editor/Viewer RBAC · Postgres full-text search + filters · hash-chained audit log + verify command · AI assistance suite (summarize, draft/rewrite, review-as-diff, scheduled + on-demand checks, suggestions queue) · one-way git/Markdown export + zip download · Markdown/zip import (Draft state) · starter template pack · SSO (OIDC) + credentials fallback · self-hosted packaging (Compose; image reusable in K8s).

**DEFERRED:**

| Deferred | Why | Target |
|---|---|---|
| **Approval workflows** (review chains, approve/reject, e-signatures) | Deliberately simplified v1; AI-suggestion accept/reject is a lightweight per-document gate, not a formal chain. Schema ships the approval/evidence tables in v1 migrations so this is UI work later | Phase 2 |
| Import **connectors** (Confluence, Notion, BookStack, Jira) | Core must be dogfooded first; Markdown/zip import covers v1 migration; prioritize connectors by where real content lives | v1.x |
| Notifications (email/Slack) | AI suggestions surface in the in-app queue in v1 | Phase 3 |
| Read/acknowledgment tracking | Write-once `acknowledgments` table ships in v1 migrations; UI later | Phase 3 |
| Formal compliance review cadence (per-doc review intervals, due-date dashboard) | The AI staleness check covers the practical need in v1; formal cadence joins approvals-era compliance features | Phase 3 |
| PDF export / one-command auditor evidence pack | Pure output layer, nothing to retrofit | Phase 4 |
| CAPA, nonconformance, audit scheduling, training/LMS, supplier quality, FDA/ISO 13485-specific features | Out of the document-control core | Phase 4+/later |
| Real-time collaborative editing (Yjs) | Solo-first; TipTap→Yjs is a proven later migration | later |
| **Cloud SaaS** (hosted, multi-tenant) | Future phase; v1 carries tenant/org identifiers in the data model so multi-tenancy isn't a rewrite | Phase 5 |

The deferred list is the scope contract: if a feature isn't needed to write, version, publish, search, AI-assist, and export our own document set from a self-hosted install, it waits.

## 8. Architecture & stack

**Hybrid storage:** Postgres canonical (documents, versions, workflow state, evidence records, jobs) + one-way git/Markdown export of published versions. Pure git-backed storage fails on UX; pure DB loses portability. Any future signature events are application-layer acts, never git commits.

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js (TypeScript), single Docker image** serving UI + API | One deployable instead of separate frontend/backend/gateway |
| Database | **PostgreSQL** | Also handles full-text search natively — no separate search service |
| ORM/migrations | **Prisma** | Versioned, reviewable schema migrations for safe upgrades |
| Editor | **TipTap 2.x pinned** (StarterKit + table family; no cell merge — keeps Markdown renders faithful), behind a thin wrapper as escape hatch; ProseMirror JSON canonical, Markdown frozen at publish via pinned serializer | Embeds directly in React; proven combination; MIT core |
| Diffing | `diff` (jsdiff) on stored version snapshots | Library-level, one dependency |
| Background jobs (AI scans, import batches, export) | **pg-boss** | Runs entirely on Postgres — no Redis or separate queue |
| Auth | **Auth.js (NextAuth)** with OIDC/SAML providers + credentials fallback | Be a client to the org's existing SSO, don't host an IdP |
| AI integration | **Anthropic API/SDK called from the app** (suggestion-generation code paths, not a separate agent runtime) | Outbound HTTPS only; disableable |
| Git export | `isomorphic-git` writing to a repo on the data volume | No git binary in the image; deterministic commits |
| Tooling | pnpm, TypeScript strict, Biome, Vitest/Playwright, GitHub Actions; multi-stage Dockerfile (Next.js standalone) | One fast toolchain; ghcr.io images on tag |

**Deliberately excluded:** Redis/BullMQ (pg-boss covers it) · Elasticsearch/Meilisearch (Postgres FTS suffices at v1 volumes) · Keycloak or any hosted IdP (be an SSO client) · microservices for import/AI (code paths in the one app).

**Data model (summary).** Audit-shaped from day one, even where UI is deferred:

- `organizations` — single row in v1; every tenant-scoped table carries `org_id` so Cloud SaaS isn't a rewrite
- `users` / `sessions` / roles (admin | editor | viewer); the AI agent acts via attributed system identity, never as a user
- `folders`, `documents` — mutable container: doc code, title, type, owner, folder, tags; current-published-version projection
- `document_versions` — immutable once published: ProseMirror JSON + frozen Markdown + SHA-256, integer version, change note, write-once lifecycle timestamps (`published_at`, `retired_at`, `superseded_at`) — the full audit lifecycle lives here even though v1 UI exposes only Draft/Published/Retired
- `suggestions` — AI suggestions queue: document, base version, payload (diff), origin (scheduled | on-demand | inline), status (pending | accepted | rejected), acting human, timestamps — write-once on resolution
- `approvals`, `reviews`, `acknowledgments` — write-once evidence tables shipped dormant in v1 migrations for Phases 2–3
- `audit_log` — append-only hash chain (`hash = sha256(prev_hash || canonical(row))`) over every action
- `settings` — org name, AI cadence/limits, export repo config, SSO config pointers

Invariants: publishing/retiring/restoring runs through one state-machine service writing timestamps + audit entries in a single transaction; publishing vN supersedes vN−1 atomically; DB triggers reject mutation of published version content and any update/delete on evidence tables and the audit log. "Which version was published on date D" falls out of the timestamp ranges.

## 9. Roadmap

### Phase 1 — v1 (this PRD's scope)

| # | Milestone | Definition of done |
|---|---|---|
| M0 | Scaffold | Next.js single-image build; Prisma + first migration (full audit-shaped schema); Compose file (app + Postgres); Biome/Vitest/CI green |
| M1 | Auth + RBAC + audit spine | Auth.js OIDC + credentials; first-run admin; role enforcement; hash-chain writer + `verify-audit`, unit-tested |
| M2 | Documents + editor | Folders/categories, doc codes, TipTap with tables + autosave, document list + metadata. *Schedule risk: the editor* |
| M3 | Versioning + lifecycle | Publish flow (integer versions, frozen Markdown + SHA), Draft-over-Published editing, retire, diff view, one-click restore-as-new-version, change-log table, immutability triggers. **The heart — do not rush** |
| M4 | Search + dashboard | Postgres FTS, filters, Viewer-safe current-version search; home view (drafts, recently updated, suggestion counts) |
| M5 | AI assistance | Summarize, inline draft/rewrite suggestions, review-as-diff, suggestions queue with accept→new version + audit attribution; pg-boss scheduled + on-demand checks with cost/rate limits |
| M6 | Export + import + templates | Git export with deterministic rebuild + zip download; Markdown/zip import to Draft; starter template pack (CC BY 4.0) on first run |
| M7 | v1 release | Install/upgrade docs, one-command Compose quickstart, ghcr.io image on tag, screenshots; **our real documents migrated in — dogfooding begins** |

### Later phases

| Phase | Focus |
|---|---|
| **1.x** | Import connectors: Confluence, Notion, BookStack, Jira/JSM KB — with best-effort history preservation and pre-commit preview |
| **2** | Approval workflows: review chains, approve/reject with role statements, e-signatures (the dormant `approvals` tables get their UI); author/approver role split decision |
| **3** | Notifications (email/Slack), read/acknowledgment tracking, formal periodic review cadence + due-date dashboard |
| **4** | Audit log dashboards/exports, PDF + auditor evidence pack, audit-chain head anchored into git export; classical-QMS template packs |
| **5** | **Cloud SaaS**: hosted multi-tenant offering, tenant isolation, billing, managed backups/upgrades, shared-responsibility model |

## 10. Risks & open questions

### Risks

| Risk | Mitigation |
|---|---|
| Low adoption if writing/editing is harder than Docs/Notion | The editor is the #1 investment (principle 1); measure against the "no training needed" bar |
| No formal quality gate before publishing until Phase 2 | Clear internal norms ("Editors self-police"); audit trail still records everything; schema ready for approvals |
| Low-value AI suggestions train Editors to ignore the queue | Tune check quality/thresholds early; monitor accept vs. reject rates from day one (they're in the audit log) |
| Incomplete migration of legacy documents causes confusion | Markdown import in v1; connector fidelity expectations set explicitly (flag, never silently drop) |
| Self-hosted-only means customers own ops burden | One-command Compose quickstart + documented upgrades; same image works in K8s |
| Multi-tenant rework when SaaS is prioritized | `org_id` on every tenant-scoped table from M0; lightweight architecture review before Phase 1 build |
| Markdown fidelity (GFM can't express merged cells) | No cell merge in v1 tables; serializer unit-tested against every template; frozen renders never re-rendered |
| TipTap license drift (vendor monetizing) | Pin versions; thin wrapper; ProseMirror-direct escape hatch |
| Tamper-evidence overclaim | Documented limits; Phase 4 anchors chain head externally |
| Permissive license lets a SaaS vendor host Bunsho | Accepted deliberately (decision log); anti-lock-in positioning doesn't depend on copyleft |
| Competitor watch | [qara-pulse-eqms](https://github.com/abonnet-qarapulse/qara-pulse-eqms) (same thesis, git-native); Comp AI (AGPL, breadth-first) |

### Open questions

- How many historical versions are retained — unlimited by default (current assumption), or capped per policy?
- What defines "staleness" for AI checks — fixed threshold (6/12 months), a per-document "next review" field, or both? (Interacts with Phase 3 formal cadence.)
- Are some documents too sensitive to send to the AI (customer data, secrets)? Per-document/per-folder AI exclusion flag?
- Should AI summaries be cached on the document version or generated fresh per request?
- Default scheduled scan cadence — weekly, monthly, per-category?
- Which import connectors actually matter first — is real content mostly in Confluence/Notion in practice?
- For messy sources (Confluence macros, exotic Notion blocks): is best-effort import + manual cleanup acceptable?
- Import: one-time migration only, or ongoing re-sync from systems not yet fully cut over?
- When approvals arrive (Phase 2): split Editor into author/approver roles, or keep the flat model with peer approval?
- Target environments: is Compose-first (with the image reusable in K8s) enough, or do we need a Helm chart at v1?
- Network egress: do some target deployments need AI features fully disabled/optional? (Current answer: yes, must be disableable.)
- Is Cloud SaaS "someday" or near-term? Changes how much multi-tenancy groundwork beyond `org_id` is worth now.
- Expected initial document volume (dozens vs. hundreds) — affects FTS and AI scan batching assumptions.
- UI naming: "Published" chosen for v1; revisit "Effective" when formal approvals arrive for the compliance crowd?

## 11. Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-13 | Target SOC 2 / ISO 27001 software companies first; classical QMS later; core standard-agnostic | User decision; niche is vacant (§2), buyer is developer-adjacent |
| 2026-07-13 | Hybrid architecture: DB canonical + one-way git/Markdown export | Pure git fails UX, pure DB fails portability; bidirectional sync is a documented failure mode |
| 2026-07-13 | TypeScript, full stack | Largest contributor pool; editor ecosystem is JS regardless |
| 2026-07-13 | Dogfood solo/internally first | Shapes the v1 scope cut |
| 2026-07-13 | Permissive license: Apache-2.0 code, CC BY 4.0 templates | Differentiates from Comp AI (AGPL); accepted SaaS-resell risk |
| 2026-07-13 | Schema audit-shaped from day one; write-once evidence tables even where UI is deferred | Event-sourced records can't be retrofitted |
| 2026-07-13 | Integer version numbers for published versions | Auditor-friendly; simpler than semver for prose |
| 2026-07-13 | Export runs automatically on publish, with manual rebuild | Evidence should never depend on remembering to export |
| 2026-07-13 | ~~Stack: Node 22 + Hono + Drizzle/SQLite + React/Vite~~ **Superseded same day** → **Next.js single image + PostgreSQL + Prisma + pg-boss + Auth.js (OIDC/SAML + credentials)** | PRD merge decision: Postgres FTS + pg-boss keep the footprint at exactly two services while enabling v1 search, jobs, and org SSO; one deployable |
| 2026-07-13 | ~~Explicit "Make effective" approval flow in v0.1~~ **Superseded same day** → **v1 lifecycle is Draft → Published → Retired; approval workflows are Phase 2** | PRD merge decision: ship the daily-use writing tool first; dormant approval/evidence tables in v1 migrations make Phase 2 UI work, not a migration |
| 2026-07-13 | AI agent assistance (summarize, draft/rewrite, review-as-diff, scheduled + on-demand checks; suggestion-only via suggestions queue) is core v1 scope | PRD merge decision: "fun and easy" depends on it; suggestion-only design keeps published docs risk-free and counters AI-policy-mill distrust |
| 2026-07-13 | Import connectors (Confluence/Notion/BookStack/Jira) deferred to v1.x; v1 ships Markdown/zip import | PRD merge decision: dogfood the core first; prioritize connectors by where real content lives |
| 2026-07-13 | Multi-tenant groundwork limited to `org_id` on tenant-scoped tables in v1 | Cloud SaaS is Phase 5; avoid painting into a corner without building for a phase that isn't scheduled |
| 2026-07-13 | Name "Bunsho" documented in §1 "About the name" (Japanese 文書, "document") | Etymology (文 writing + 書 write/document) encodes the thesis — writing and the controlled document are one; connotes formal/official documents, the register Bunsho serves |
| 2026-07-14 | Keep Prisma as the ORM/migration layer (reaffirmed at M0 build) | User decision; matches §8 and largest TS contributor pool. Trade-off accepted: immutability/write-once invariants aren't expressible in Prisma's schema and ship as raw-SQL trigger migrations alongside the generated init migration |
| 2026-07-14 | Invariants enforced by DB triggers (`*_audit_triggers` migration): published `document_versions` are content-immutable (only `retiredAt`/`supersededAt` may transition); `audit_log` append-only; `approvals`/`reviews`/`acknowledgments` write-once. Published versions remain DELETE-able so an Admin document delete cascades; the deletion is recorded in the immutable `audit_log`. Consequence: an org (and any doc carrying evidence rows) cannot be hard-deleted once audited — accepted, matching "history retained indefinitely" | M0 implementation decision: defend the audit story at the database layer, not just in app code; the delete/cascade seam keeps the single-org v1 clean while making evidence non-erasable |
| 2026-07-14 | Auth.js adapter tables (accounts/sessions/verification) deferred from the M0 first migration to M1 | They are mutable auth plumbing, not write-once evidence, so adding them in M1 is additive — not a retrofit of history. The audit-shaped domain schema (versions, suggestions, evidence, audit_log) ships complete in M0 |
| 2026-07-14 | **M1: Auth.js runs JWT sessions with NO adapter tables** (supersedes the row above). Role + `active` are resolved fresh from the DB on every request via `requireUser`; passwords hashed with Node's built-in `scrypt`; `trustHost: true` for self-hosted; OIDC users provisioned as `viewer` on first sign-in | The Credentials provider is incompatible with Auth.js database sessions, so JWT is required and the `Account`/`Session` tables are unnecessary. Reading role/active per request keeps deactivation and role changes effective despite stateless tokens. scrypt avoids a native dependency (smallest-footprint principle) |
| 2026-07-14 | **M1: audit invariants defended in depth** — a DB trigger blocks any UPDATE/DELETE on `audit_log`, and independently the SHA-256 hash chain (`hash = sha256(prevHash ‖ canonical(row))`, per-org advisory-lock-serialized appends, hash computed pre-insert since the row is UPDATE-blocked) makes tampering detectable by `verify-audit` even if a trigger were bypassed | Two independent layers realize tamper-*evidence* (principle 8): the trigger is the first line, the chain is the proof. Verified live: intact chain passes, a superuser-bypassed edit is caught with a non-zero exit |
| 2026-07-14 | **M2: drafts are unpublished `document_versions`** (`publishedAt` null, mutable — the freeze trigger only locks published rows); `markdown`/`contentSha` made nullable (a draft has no frozen Markdown yet, set at publish); **at most one open draft per document** enforced by a trigger, not a partial unique index | A partial unique index would register as Prisma schema drift and fail CI's drift check; a trigger is drift-invisible and consistent with the other invariants. The nullable columns are honest about draft state rather than using sentinel values |
| 2026-07-14 | **M2: TipTap 2.x pinned to exact versions** (StarterKit + table family; no cell-merge extension); editor extensions live behind one `buildEditorExtensions()` wrapper (ProseMirror-direct escape hatch); **autosave writes ProseMirror JSON to the draft and is NOT audit-logged** (only `document_created` is; `version_created` on publish comes in M3); doc codes auto-number per type prefix (POL/SOP/WI/STD/DOC), overridable | Pinning mitigates TipTap license/vendor drift (risk log); no cell-merge keeps Markdown faithful (§4.3). Keeping keystroke-level autosaves out of the audit log keeps the chain meaningful — controlled-document events (publish/retire) are what auditors read. M2's document-management UI is gated to Editor/Admin; the Viewer-facing published-only search is M4/M6 |
| 2026-07-14 | **M3: publish freezes a hand-written, deterministic ProseMirror→GFM Markdown serializer output + SHA-256** on the draft version (which then becomes immutable); prior current version is superseded and the document's `currentPublishedVersionId` projection advances, all in one audited transaction | Hand-rolled serializer (unit-tested for byte-identical output) gives full control over GFM table rendering and escaping, which prosemirror-markdown lacks; determinism is a hard requirement (§6). Publishing a draft is allowed by the freeze trigger because the row isn't yet published at update time |
| 2026-07-14 | **M3: editing a published doc forks a new draft** (next version number, content copied from current published); **restore stages a prior version into a draft** (never auto-publishes — human reviews then publishes, preserving the suggestion-only ethos and "never deletes history"); **retire** is Admin-only and sets `retiredAt` on both the document and its current version; diff is jsdiff word-level on frozen Markdown | Fork/restore-to-draft keep a human gate before any new controlled version exists; document-level `retiredAt` (added this milestone) makes lifecycle state and the future Viewer search a simple query. Verified live end-to-end: publish→supersede→fork→republish→diff→restore→retire with the audit chain intact |
| 2026-07-14 | **M4: full-text search via inline `to_tsvector`/`websearch_to_tsquery` over the current published Markdown + title + doc code** (no stored tsvector column / GIN index yet); role-aware — Viewers only ever match current published, non-retired docs; a role-aware read view lets Viewers open published documents (no actions/history) | At v1 volumes (dozens–hundreds of docs, §10) inline FTS is fast and avoids a generated column that would either fight Prisma's drift check or need `Unsupported` typing; a stored GIN-indexed column is a later optimization. Draft *bodies* aren't indexed (no frozen Markdown) — drafts match by title/code. Verified live: content matches, Viewer restriction (drafts hidden), and status/type/folder filters |
| 2026-07-14 | **M7: v1 release packaging** — one-command Docker Compose quickstart (env-wired `AUTH_SECRET`/AI/OIDC passthrough; `migrate` one-shot applies schema upgrades before the app starts); ghcr.io image published on version tags via a release workflow; `openssl` added to the image for Prisma engine detection; Apache-2.0 `LICENSE` (+ CC BY 4.0 note for templates); `docs/INSTALL.md` (install/upgrade/backup/verify-audit). Phase 1 (M0–M7) is feature-complete; dogfooding is next | Verified live: `docker compose up --build` brings up db → migrate → app; in-container health, first-run `/setup`, and auth CSRF (AUTH_SECRET + trustHost) all work; documented `verify-audit` runs clean with no OpenSSL warning. Later phases (1.x connectors, 2 approvals, 3 notifications, 4 audit/PDF, 5 SaaS) remain future work as scoped |
| 2026-07-14 | **M6: one-way git/Markdown export is a deterministic projection of the DB** — each doc exported as `<folder>/<code>.md` (YAML front matter + frozen body + change-log table); the git rebuild replays every published version as one commit (author timestamp = publish time, fixed identity) so re-running yields identical commit SHAs; zip download uses fixed entry dates. Import parses Markdown→ProseMirror (markdown-it) and lands content in **Draft** (never auto-published); front-matter `code`/`title`/`type` honored. Starter pack = 8 original SOC 2 templates (CC BY 4.0), seeded idempotently as Drafts | Determinism satisfies §6 ("export rebuilds are byte-identical"). **Building the Markdown→ProseMirror parser here also closes the M5 gap** — LLM content rewrites can now be applied to drafts (wiring only). Verified live end-to-end: templates idempotent, export front-matter/change-log, two git rebuilds → same HEAD SHA, zip round-trips, import → Draft with parsed nodes; audit chain intact |
| 2026-07-14 | **M5: AI is suggestion-only and off unless `ANTHROPIC_API_KEY` is set** (`AI_ENABLED=false` force-disables); Anthropic SDK, model `claude-opus-4-8`. Staleness + broken-reference checks are **deterministic** (no LLM, so they're cheap and testable); summary/review call the LLM. Everything lands in a per-document suggestions queue; **accepting a content suggestion (payload carries ProseMirror JSON) forks/updates the draft → a new version**, audit-logged `suggestion_accepted` as AI-originated with the approving human recorded. Suggestions dedup against *pending* only. `maxPerRun` caps each check run (cost/rate). Scheduled checks run on **pg-boss** (own `pgboss` schema — no Prisma drift), started via `instrumentation.ts`, gated by `AI_SCHEDULED_CHECKS`; on-demand checks run inline | Deterministic checks realize the audit-critical accept→version→attribution loop and are fully live-verified without an API key. **Deferred: LLM-generated *content* rewrites that apply to the draft** — the serializer is one-way (Markdown is frozen output, ProseMirror JSON is canonical), so applying LLM Markdown would need a Markdown→ProseMirror parser; until then the accept-content path is exercised via suggestions whose payload already carries ProseMirror JSON, and LLM review returns advisory notes. pg-boss/schedule opt-in keeps CI/dev clean; the worker + round-trip are verified by script |
| 2026-07-14 | **UI redesign shipped as a pure presentation layer: "carbon & gold" design system** — Tailwind CSS v4 (+@tailwindcss/postcss) + `motion` + `lucide-react` + self-hosted `next/font` (Archivo display / Inter body / IBM Plex Mono for doc codes, stamps, eyebrow labels); dark-only carbon theme with champagne-gold accents per user-supplied visual direction; **documents render on a cream "paper" surface** (editor + published view) so long-form reading stays light-on-dark-free; hanko motif: statuses as seal chips, **publish plays a one-time gold seal-stamp celebration** (driven by a `?published=` redirect param, stripped on play); persistent role-aware sidebar shell via `(app)`/`(auth)` route groups (URLs unchanged); gamification capped at progress-and-delight (lifecycle stepper, stat count-ups, library-health ring, suggestions inbox) — no points/XP/badges. All animation respects `prefers-reduced-motion` | The old inline-style UI read as unusable; PRD §1 promises "fun and easy." Build-time deps keep the two-service footprint (§4.5); TipTap extensions/serializer untouched so frozen Markdown determinism holds (§6); dark-only commits to one polished look while CSS tokens leave a light theme open. Incidental fix: pg-boss stubbed out of the edge instrumentation compile (`next.config.mjs`) so `next dev` works outside Docker |
| 2026-07-15 | **draw.io diagrams as first-class editor blocks, air-gapped by default** — new TipTap `drawio` atom node whose single attribute is the *editable SVG* data URI draw.io exports (`xmlsvg`: the rendered SVG carries its source mxfile XML in its `content` attribute), so one string is both the picture and the re-editable source. Editing happens in a full-screen embedded draw.io (JSON postMessage protocol: `init`→load, `save`→export `xmlsvg`→apply); toolbar "Insert diagram" opens it immediately, double-click or hover button re-edits, read-only views render the image with no edit affordance. The draw.io webapp itself is **vendored into the image** at build time (`scripts/fetch-drawio.ts` via `prebuild`/`predev`: pinned v30.3.11 `draw.war`, sha256-verified, extracted to gitignored `public/drawio/`) and served same-origin with `stealth=1`, so drawing needs **zero external network** — required for air-gapped installs; `NEXT_PUBLIC_DRAWIO_URL` (build-time) can point at another deployment, `DRAWIO_SKIP_FETCH=1` skips vendoring. Markdown stays faithful: serializes as a plain GFM image `![drawio](data:image/svg+xml;base64,…)`; the importer routes SVG data-URI images back to `drawio` blocks (markdown-it `validateLink` extended to allow `data:image/svg+xml`, safe because they render via `<img>` where SVG scripts never execute) | Diagrams-as-data keeps versions self-contained: the diagram lives inside the frozen Markdown bytes (§6 determinism), so diffs and the git export need no side files, and history survives with the document. Bundling the editor keeps the two-service deployment (§4.5/§8) honest for offline/compliance environments — the alternative (public embed.diagrams.net) leaks availability and metadata to a third party. Trade-offs accepted: app image grows ~150 MB (stencil/shape libraries dominate; trimming them would gut the editor), and diagram bytes (tens of KB each) live in the document JSON/Markdown, so a changed diagram shows as one long data-URI line in diffs |

## Appendix A: research sources

**Audit requirements:** [ISO 27001 7.5 (isms.online)](https://www.isms.online/iso-27001/requirements-2022/7-5-documented-information-2022/) · [SOC 2 required policies (Konfirmity)](https://www.konfirmity.com/blog/soc-2-policies-required) · [SOC 2 evidence requests (Schneider Downs)](https://schneiderdowns.com/our-thoughts-on/soc2-requested-evidence/) · [ISO 9001 7.5 guide](https://www.thecoresolution.com/clause-7-5-iso-90012015-explained) · [ISO 13485 4.2.4 (Hardcore QMS)](https://hardcoreqms.com/13485/document-control-iso-13485/) · [21 CFR Part 11 (eCFR)](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11) · [FDA QMSR](https://www.fda.gov/medical-devices/postmarket-requirements-devices/quality-management-system-regulation-qmsr)

**Git-as-QMS:** [OpenRegulatory: QMS in GitHub/GitLab](https://openregulatory.com/quality-management-system-qms-in-github-gitlab/) · [OpenRegulatory retraction](https://openregulatory.com/we-no-longer-recommend-github-gitlab-as-qms-software/) · [IntuitionLabs: git workflows for FDA compliance](https://intuitionlabs.ai/articles/git-workflows-fda-compliance) · [GSTT-CSC QMS-Template](https://github.com/GSTT-CSC/QMS-Template) · [Tidepool qmsOS certification](https://www.tidepool.org/blog/tidepools-open-source-qms-gets-iso-13485-certified)

**Competitive landscape:** [Vanta pricing](https://www.complyjet.com/blog/vanta-pricing-guide-2025) · [Drata policy issues](https://help.drata.com/en/articles/13252508-common-policy-management-issues-in-drata-and-how-to-resolve-them) · [StrongDM Comply](https://github.com/strongdm/comply) · [Comp AI](https://github.com/trycompai/comp) · [Probo](https://github.com/getprobo/probo) · [CISO Assistant](https://github.com/intuitem/ciso-assistant-community) · [Gapps](https://github.com/bmarsh9/gapps) · [innolitics/rdm](https://github.com/innolitics/rdm) · [Greenlight Guru price exposé](https://openregulatory.com/articles/greenlight-guru-price) · [OSS GRC comparison](https://infosecflow.com/blog/open-source-grc-comparison/) · [Delve scandal](https://deepdelver.substack.com/p/delve-fake-compliance-as-a-service)

**Stack references:** [Docmost architecture](https://deepwiki.com/docmost/docmost) · [TipTap open-sourcing announcement](https://tiptap.dev/blog/release-notes/were-open-sourcing-more-of-tiptap) · [Editor framework comparison (Liveblocks)](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025) · [Forgejo relicensing](https://forgejo.org/2024-08-gpl/) · [JupiterOne policy templates](https://github.com/JupiterOne/security-policy-templates)
