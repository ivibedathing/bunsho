import { type PMNode, serializeToMarkdown } from "@/lib/markdown/serialize";

/**
 * The exported form of a published document (DECISIONS.md): YAML front matter +
 * Markdown body + an auto-maintained change-log table. Deterministic — the same
 * DB state always produces byte-identical output, so a git rebuild is stable.
 */

export interface ExportMeta {
  docCode: string;
  title: string;
  version: number;
  publishedAt: Date;
  author?: string | null;
  changeNote?: string | null;
}

export interface ChangeLogEntry {
  version: number;
  publishedAt: Date;
  changeNote: string | null;
  author: string | null;
}

/** YAML scalar: always double-quoted + escaped, so any title is safe. */
function yaml(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function frontMatter(meta: ExportMeta): string {
  const lines = [
    "---",
    `code: ${yaml(meta.docCode)}`,
    `title: ${yaml(meta.title)}`,
    `version: ${meta.version}`,
    `published: ${meta.publishedAt.toISOString()}`,
  ];
  if (meta.author) lines.push(`author: ${yaml(meta.author)}`);
  if (meta.changeNote) lines.push(`change_note: ${yaml(meta.changeNote)}`);
  lines.push("---");
  return lines.join("\n");
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function changeLogTable(entries: ChangeLogEntry[]): string {
  const rows = entries
    .slice()
    .sort((a, b) => a.version - b.version)
    .map(
      (e) =>
        `| v${e.version} | ${e.publishedAt.toISOString().slice(0, 10)} | ${cell(e.changeNote ?? "")} | ${cell(e.author ?? "")} |`,
    );
  return [
    "## Change log",
    "",
    "| Version | Date | Change | Author |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/**
 * Assemble the exported Markdown. `bodyMarkdown` is the frozen Markdown of the
 * published version (preferred); if absent it is serialized from ProseMirror JSON.
 */
export function documentToMarkdown(input: {
  meta: ExportMeta;
  bodyMarkdown?: string | null;
  bodyJson?: PMNode | null;
  changeLog: ChangeLogEntry[];
}): string {
  const body = (
    input.bodyMarkdown ?? (input.bodyJson ? serializeToMarkdown(input.bodyJson) : "")
  ).trimEnd();
  return `${[frontMatter(input.meta), "", body, "", changeLogTable(input.changeLog)].join("\n")}\n`;
}
