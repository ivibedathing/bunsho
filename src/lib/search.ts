import { Prisma, type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export interface SearchRow {
  id: string;
  docCode: string;
  title: string;
  type: string;
  updatedAt: Date;
  currentPublishedVersionId: string | null;
  retiredAt: Date | null;
  ownerName: string | null;
  ownerEmail: string | null;
  folderName: string | null;
}

export interface SearchOptions {
  query: string;
  folderId?: string;
  type?: string;
  status?: string;
}

/**
 * Full-text search over documents (PRD §8 — Postgres FTS, no separate engine).
 * FTS runs inline over the current published version's frozen Markdown plus the
 * title and doc code; at v1 volumes a stored tsvector/GIN index isn't needed yet.
 *
 * Role-aware (PRD §3, §6): Viewers only ever see current, published, non-retired
 * documents. Editors/Admins see everything and may filter by status. Draft *body*
 * text isn't indexed (drafts have no frozen Markdown) — drafts match by title/code.
 */
export async function searchDocuments(
  orgId: string,
  role: Role,
  opts: SearchOptions,
): Promise<SearchRow[]> {
  const q = opts.query.trim();
  const hasQuery = q.length > 0;
  const viewerOnly = role === "viewer";

  const conditions: Prisma.Sql[] = [Prisma.sql`d."orgId" = ${orgId}`];

  if (viewerOnly) {
    conditions.push(
      Prisma.sql`d."currentPublishedVersionId" IS NOT NULL AND d."retiredAt" IS NULL`,
    );
  } else if (opts.status === "published") {
    conditions.push(
      Prisma.sql`d."currentPublishedVersionId" IS NOT NULL AND d."retiredAt" IS NULL`,
    );
  } else if (opts.status === "draft") {
    conditions.push(Prisma.sql`d."currentPublishedVersionId" IS NULL AND d."retiredAt" IS NULL`);
  } else if (opts.status === "retired") {
    conditions.push(Prisma.sql`d."retiredAt" IS NOT NULL`);
  }

  if (opts.folderId) conditions.push(Prisma.sql`d."folderId" = ${opts.folderId}`);
  if (opts.type) conditions.push(Prisma.sql`d."type" = ${opts.type}::"DocumentType"`);

  // The searchable text for a document: published body + title + code.
  const docText = Prisma.sql`(coalesce(v.markdown, '') || ' ' || d.title || ' ' || d."docCode")`;

  if (hasQuery) {
    conditions.push(
      Prisma.sql`to_tsvector('english', ${docText}) @@ websearch_to_tsquery('english', ${q})`,
    );
  }

  // A bare integer in ORDER BY is read as a column position, so branch the whole clause.
  const orderBy = hasQuery
    ? Prisma.sql`ts_rank(to_tsvector('english', ${docText}), websearch_to_tsquery('english', ${q})) DESC, d."updatedAt" DESC`
    : Prisma.sql`d."updatedAt" DESC`;

  return prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    SELECT d.id,
           d."docCode"                    AS "docCode",
           d.title,
           d."type"::text                 AS type,
           d."updatedAt"                  AS "updatedAt",
           d."currentPublishedVersionId"  AS "currentPublishedVersionId",
           d."retiredAt"                  AS "retiredAt",
           o.name                         AS "ownerName",
           o.email                        AS "ownerEmail",
           f.name                         AS "folderName"
    FROM documents d
    LEFT JOIN document_versions v ON v.id = d."currentPublishedVersionId"
    LEFT JOIN users o ON o.id = d."ownerId"
    LEFT JOIN folders f ON f.id = d."folderId"
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY ${orderBy}
    LIMIT 100
  `);
}
