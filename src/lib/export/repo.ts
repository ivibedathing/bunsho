import nodefs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import git from "isomorphic-git";
import JSZip from "jszip";
import { type ChangeLogEntry, documentToMarkdown } from "./document";

/**
 * One-way git/Markdown export (PRD §7 F9). The export is a deterministic
 * projection of the DB: current published docs as `<folder>/<code>.md`, and a
 * git history where each published version is one commit (author timestamp =
 * publish time), so a rebuild is byte-identical and history-stable.
 */

const GENESIS_ZIP_DATE = new Date("2020-01-01T00:00:00.000Z");

function authorName(u: { name: string | null; email: string } | null): string | null {
  return u ? (u.name ?? u.email) : null;
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

export interface ExportFile {
  path: string;
  markdown: string;
}

/** Markdown files for the current published version of every non-retired doc. */
export async function collectExport(orgId: string): Promise<ExportFile[]> {
  const docs = await prisma.document.findMany({
    where: { orgId, currentPublishedVersionId: { not: null }, retiredAt: null },
    orderBy: { docCode: "asc" },
    include: {
      folder: { select: { name: true } },
      currentPublishedVersion: { include: { author: { select: { name: true, email: true } } } },
      versions: {
        where: { publishedAt: { not: null } },
        orderBy: { version: "asc" },
        include: { author: { select: { name: true, email: true } } },
      },
    },
  });

  const files: ExportFile[] = [];
  for (const d of docs) {
    const v = d.currentPublishedVersion;
    if (!v?.publishedAt) continue;
    const changeLog: ChangeLogEntry[] = d.versions
      .filter((pv) => pv.publishedAt)
      .map((pv) => ({
        version: pv.version,
        publishedAt: pv.publishedAt as Date,
        changeNote: pv.changeNote,
        author: authorName(pv.author),
      }));
    const markdown = documentToMarkdown({
      meta: {
        docCode: d.docCode,
        title: d.title,
        version: v.version,
        publishedAt: v.publishedAt,
        author: authorName(v.author),
        changeNote: v.changeNote,
      },
      bodyMarkdown: v.markdown,
      changeLog,
    });
    const dir = d.folder ? `${slug(d.folder.name)}/` : "";
    files.push({ path: `${dir}${d.docCode}.md`, markdown });
  }
  return files;
}

/** Zip of the Markdown set (F9 — zip download). Fixed entry dates for stability. */
export async function buildZip(orgId: string): Promise<Buffer> {
  const files = await collectExport(orgId);
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.markdown, { date: GENESIS_ZIP_DATE });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * Rebuild a git repo at `dir` from the DB (F9 — deterministic rebuild). Wipes
 * and re-creates the repo, replaying every published version as one commit in
 * (publishedAt, document, version) order. Same DB state → same commit SHAs.
 */
export async function rebuildGitRepo(
  orgId: string,
  dir: string,
): Promise<{ commits: number; head: string | null }> {
  await nodefs.promises.rm(dir, { recursive: true, force: true });
  await nodefs.promises.mkdir(dir, { recursive: true });
  await git.init({ fs: nodefs, dir, defaultBranch: "main" });

  const versions = await prisma.documentVersion.findMany({
    where: { orgId, publishedAt: { not: null } },
    orderBy: [{ publishedAt: "asc" }, { documentId: "asc" }, { version: "asc" }],
    include: {
      author: { select: { name: true, email: true } },
      document: { include: { folder: { select: { name: true } } } },
    },
  });

  // Per-document published versions, for the change log as of each commit.
  const byDoc = new Map<string, typeof versions>();
  for (const v of versions) {
    const list = byDoc.get(v.documentId) ?? [];
    list.push(v);
    byDoc.set(v.documentId, list);
  }

  const author = { name: "Bunsho Export", email: "export@bunsho.local" };
  let commits = 0;

  for (const v of versions) {
    if (!v.publishedAt) continue;
    const d = v.document;
    const changeLog: ChangeLogEntry[] = (byDoc.get(v.documentId) ?? [])
      .filter((pv) => pv.publishedAt && pv.version <= v.version)
      .map((pv) => ({
        version: pv.version,
        publishedAt: pv.publishedAt as Date,
        changeNote: pv.changeNote,
        author: authorName(pv.author),
      }));

    const markdown = documentToMarkdown({
      meta: {
        docCode: d.docCode,
        title: d.title,
        version: v.version,
        publishedAt: v.publishedAt,
        author: authorName(v.author),
        changeNote: v.changeNote,
      },
      bodyMarkdown: v.markdown,
      changeLog,
    });

    const rel = d.folder ? `${slug(d.folder.name)}/${d.docCode}.md` : `${d.docCode}.md`;
    await nodefs.promises.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await nodefs.promises.writeFile(path.join(dir, rel), markdown);
    await git.add({ fs: nodefs, dir, filepath: rel });

    const stamp = {
      ...author,
      timestamp: Math.floor(v.publishedAt.getTime() / 1000),
      timezoneOffset: 0,
    };
    await git.commit({
      fs: nodefs,
      dir,
      message: `${d.docCode} v${v.version}: ${v.changeNote ?? "published"}`,
      author: stamp,
      committer: stamp,
    });
    commits++;
  }

  const head = commits > 0 ? await git.resolveRef({ fs: nodefs, dir, ref: "HEAD" }) : null;
  return { commits, head };
}
