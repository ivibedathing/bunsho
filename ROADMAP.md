# Bunsho — Roadmap

> Derived from [PRD.md](./PRD.md) (Draft v2, 2026-07-13). The PRD is the source of truth;
> this file is a working view of *when* things ship. When scope or sequencing changes,
> update the PRD first (and its [Decision log](./PRD.md#11-decision-log)), then reflect it here.

**Thesis:** *git inside, Google-Docs outside.* Ship the document-control slice extremely well —
immutable versions, audit-shaped data model, tamper-evident log, portable Markdown — behind a
fast, friendly editor with zero git vocabulary.

**North star for v1:** everything needed to *write, version, publish, search, AI-assist, and
export* our own controlled-document set from a self-hosted install — then dogfood it. If a
feature isn't needed for that, it waits (§7 scope contract).

---

## Phase 1 — v1 (current focus)

Guiding rules: the schema is **audit-shaped from day one** (write-once records can't be
retrofitted), the UI ships the **simplest lifecycle** that makes Bunsho a daily writing home
(Draft → Published → Retired), and **AI assistance is in v1** because "fun and easy" is the product.

| # | Milestone | Definition of done | Requirements |
|---|---|---|---|
| **M0** | **Scaffold** | Next.js single-image build; Prisma + first migration (full audit-shaped schema); Compose file (app + Postgres); Biome/Vitest/CI green | §8 |
| **M1** | **Auth + RBAC + audit spine** | Auth.js OIDC + credentials; first-run admin; role enforcement; hash-chain writer + `verify-audit`, unit-tested | F5, F7 |
| **M2** | **Documents + editor** | Folders/categories, doc codes, TipTap with **tables** + autosave, document list + metadata. *Schedule risk: the editor* | F1 |
| **M3** | **Versioning + lifecycle** ⭐ | Publish flow (integer versions, frozen Markdown + SHA), Draft-over-Published editing, retire, diff view, one-click restore-as-new-version, change-log table, immutability triggers. **The heart — do not rush** | F2, F3, F4 |
| **M4** | **Search + dashboard** | Postgres FTS, filters, Viewer-safe current-version search; home view (drafts, recently updated, suggestion counts) | F6 |
| **M5** | **AI assistance** | Summarize, inline draft/rewrite suggestions, review-as-diff, suggestions queue with accept → new version + audit attribution; pg-boss scheduled + on-demand checks with cost/rate limits | F8 |
| **M6** | **Export + import + templates** | Git export with deterministic rebuild + zip download; Markdown/zip import to Draft; starter template pack (CC BY 4.0) on first run | F9, F10, F11 |
| **M7** | **v1 release** | Install/upgrade docs, one-command Compose quickstart, ghcr.io image on tag, screenshots; **our real documents migrated in — dogfooding begins** | — |

### v1 scope at a glance

**IN:** document repository with folders/categories · TipTap editor with tables + autosave ·
Draft → Published → Retired lifecycle · immutable integer versions + change notes + auto
change-log table · diff/restore · Admin/Editor/Viewer RBAC · Postgres full-text search + filters ·
hash-chained audit log + verify command · AI assistance suite · one-way git/Markdown export + zip
download · Markdown/zip import (Draft state) · starter template pack · SSO (OIDC) + credentials
fallback · self-hosted packaging (Compose; image reusable in K8s).

---

## Later phases

The deferred list is the scope contract. Each item ships when its phase arrives; the schema
already carries the **dormant write-once tables** (`approvals`, `reviews`, `acknowledgments`) and
`org_id` on tenant-scoped tables, so later phases are UI work, not migrations.

| Phase | Focus | Notable deferred items |
|---|---|---|
| **1.x** | **Import connectors** | Confluence, Notion, BookStack, Jira/JSM KB — best-effort history preservation, pre-commit preview; flag (never silently drop) unsupported formatting |
| **2** | **Approval workflows** | Review chains, approve/reject with role statements, e-signatures (dormant `approvals` tables get their UI); resolve author/approver role split |
| **3** | **Notifications & tracking** | Email/Slack notifications; read/acknowledgment tracking; formal periodic review cadence + due-date dashboard |
| **4** | **Audit & output** | Audit-log dashboards/exports; PDF + one-command auditor evidence pack; audit-chain head anchored into git export; classical-QMS template packs |
| **5** | **Cloud SaaS** | Hosted multi-tenant offering, tenant isolation, billing, managed backups/upgrades, shared-responsibility model |

### Deferred rationale (from §7)

| Deferred | Why it waits | Target |
|---|---|---|
| Approval workflows (chains, e-signatures) | v1 deliberately simplified; AI accept/reject is the lightweight gate; schema ships approval/evidence tables now | Phase 2 |
| Import connectors | Dogfood the core first; Markdown/zip import covers v1 migration | v1.x |
| Notifications (email/Slack) | AI suggestions surface in the in-app queue in v1 | Phase 3 |
| Read/acknowledgment tracking | Write-once `acknowledgments` table ships dormant in v1 | Phase 3 |
| Formal review cadence + due-date dashboard | AI staleness check covers the practical need in v1 | Phase 3 |
| PDF export / auditor evidence pack | Pure output layer, nothing to retrofit | Phase 4 |
| CAPA, nonconformance, training/LMS, supplier quality, 13485/FDA specifics | Outside the document-control core | Phase 4+ |
| Real-time collaborative editing (Yjs) | Solo-first; TipTap → Yjs is a proven later migration | later |
| Cloud SaaS (hosted, multi-tenant) | Future phase; `org_id` in the data model now avoids a rewrite | Phase 5 |

---

## Open questions gating sequencing

These don't block M0–M3 but should resolve before the milestones they touch (full list in §10):

- **AI (M5):** what defines "staleness" — fixed threshold, per-doc "next review" field, or both?
  Per-document/per-folder AI-exclusion flag for sensitive content? Default scan cadence?
  Cache AI summaries on the version or generate fresh?
- **Import (v1.x):** which connectors matter first (is content mostly in Confluence/Notion)?
  One-time migration only, or ongoing re-sync?
- **Approvals (Phase 2):** split Editor into author/approver, or keep the flat model with peer approval?
- **Packaging (M7):** is Compose-first (image reusable in K8s) enough, or is a Helm chart needed at v1?
- **SaaS (Phase 5):** "someday" or near-term — how much multi-tenancy groundwork beyond `org_id` now?

---

*Milestone definitions, requirement IDs (F1–F11), and the decision log live in [PRD.md](./PRD.md).*
