import type { Prisma, Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { EMPTY_DOC } from "@/lib/documents";

/**
 * Fixtures and helpers for the integration suite. Everything here talks to the
 * real scratch database — see `src/test/env.ts` for why.
 */

/** Every tenant-scoped table, ordered for readability (TRUNCATE CASCADE handles FKs). */
const TABLES = [
  "audit_log",
  "acknowledgments",
  "approvals",
  "reviews",
  "suggestions",
  "attachments",
  "document_versions",
  "documents",
  "folders",
  "settings",
  "users",
  "organizations",
] as const;

/** Empty every table. `RESTART IDENTITY` resets audit_log's `seq` so chains start at 1. */
export async function resetDb(): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function makeOrg(name = "Acme QA") {
  return prisma.organization.create({ data: { name } });
}

export async function makeUser(
  orgId: string,
  overrides: Partial<{ email: string; name: string; role: Role; active: boolean }> = {},
) {
  return prisma.user.create({
    data: {
      orgId,
      email: overrides.email ?? `user-${Math.random().toString(36).slice(2, 10)}@example.test`,
      name: overrides.name ?? "Test User",
      role: overrides.role ?? "editor",
      active: overrides.active ?? true,
    },
  });
}

/** An org with an admin — the usual starting point for a lifecycle test. */
export async function makeOrgWithAdmin() {
  const org = await makeOrg();
  const admin = await makeUser(org.id, { role: "admin", name: "Ada Admin" });
  return { org, admin };
}

export async function makeFolder(orgId: string, name = "Policies") {
  return prisma.folder.create({ data: { orgId, name } });
}

/** ProseMirror JSON for a document consisting of the given paragraphs. */
export function pmDoc(...paragraphs: string[]): Prisma.InputJsonValue {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: text ? [{ type: "text", text }] : undefined,
    })),
  } as unknown as Prisma.InputJsonValue;
}

/**
 * A document with an open v1 draft, created directly (not via `createDocument`)
 * so tests of other modules don't depend on that module's audit behaviour.
 */
export async function makeDocumentWithDraft(
  orgId: string,
  authorId: string,
  overrides: Partial<{
    docCode: string;
    title: string;
    folderId: string | null;
    json: Prisma.InputJsonValue;
  }> = {},
) {
  const doc = await prisma.document.create({
    data: {
      orgId,
      docCode: overrides.docCode ?? `DOC-${Math.floor(Math.random() * 900 + 100)}`,
      title: overrides.title ?? "Test Document",
      folderId: overrides.folderId ?? null,
      ownerId: authorId,
    },
  });
  const draft = await prisma.documentVersion.create({
    data: {
      orgId,
      documentId: doc.id,
      version: 1,
      prosemirrorJson: overrides.json ?? (EMPTY_DOC as unknown as Prisma.InputJsonValue),
      authorId,
    },
  });
  return { doc, draft };
}

/** Read an org's audit actions in chain order — the assertion most tests want. */
export async function auditActions(orgId: string): Promise<string[]> {
  const rows = await prisma.auditLogEntry.findMany({
    where: { orgId },
    orderBy: { seq: "asc" },
    select: { action: true },
  });
  return rows.map((r) => r.action);
}
