import { prisma } from "@/lib/db";
import { isValidDocCode, normalizeDocCode } from "@/lib/docCode";
import { createDocument, nextDocCode, saveDraft } from "@/lib/documents";
import { markdownToProseMirror } from "@/lib/markdown/parse";
import JSZip from "jszip";

/**
 * Markdown / zip import (PRD §7 F11, v1). Imported content is parsed to
 * ProseMirror JSON and lands in a **Draft** for review — never auto-published.
 * Doc code/title come from YAML front matter when present, else inferred.
 */

export interface ImportResult {
  created: number;
  skipped: { name: string; reason: string }[];
}

function parseFrontMatter(content: string): { meta: Record<string, string>; body: string } {
  if (!content.startsWith("---")) return { meta: {}, body: content };
  const end = content.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: content };
  const block = content.slice(3, end).trim();
  const body = content.slice(end + 4).replace(/^\r?\n/, "");
  const meta: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (m?.[1]) {
      meta[m[1]] = (m[2] ?? "")
        .replace(/^"(.*)"$/, "$1")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
  }
  return { meta, body };
}

function firstHeading(body: string): string | null {
  const m = body.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() ?? null;
}

async function codeTaken(orgId: string, code: string): Promise<boolean> {
  return !!(await prisma.document.findFirst({
    where: { orgId, docCode: code },
    select: { id: true },
  }));
}

export async function importMarkdownFiles(
  orgId: string,
  actorId: string,
  files: { name: string; content: string }[],
): Promise<ImportResult> {
  let created = 0;
  const skipped: { name: string; reason: string }[] = [];

  for (const file of files) {
    try {
      const { meta, body } = parseFrontMatter(file.content);
      const baseName = file.name.replace(/\.md$/i, "").split("/").pop() ?? "Imported";
      const title = meta.title || firstHeading(body) || baseName;

      let code = meta.code ? normalizeDocCode(meta.code) : "";
      if (code && (!isValidDocCode(code) || (await codeTaken(orgId, code)))) code = "";
      if (!code) code = await nextDocCode(orgId);

      const doc = await createDocument(orgId, actorId, { title, docCode: code });
      const json = markdownToProseMirror(body.trim() || `# ${title}`);
      await saveDraft(orgId, doc.id, json);
      created++;
    } catch (e) {
      skipped.push({ name: file.name, reason: (e as Error).message });
    }
  }
  return { created, skipped };
}

export async function importZip(
  orgId: string,
  actorId: string,
  buffer: Buffer,
): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(buffer);
  const files: { name: string; content: string }[] = [];
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || !name.toLowerCase().endsWith(".md")) continue;
    files.push({ name, content: await entry.async("string") });
  }
  return importMarkdownFiles(orgId, actorId, files);
}
