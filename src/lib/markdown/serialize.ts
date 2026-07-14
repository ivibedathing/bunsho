/**
 * Deterministic ProseMirror-JSON → GFM Markdown serializer.
 *
 * The canonical draft format is ProseMirror JSON; at publish we freeze a Markdown
 * rendering that must be byte-identical on every run (PRD §6 determinism, §8
 * "Markdown frozen at publish via a pinned serializer"). This is that pinned
 * serializer — hand-written so table output and escaping are fully under our
 * control (prosemirror-markdown has no GFM table support). One-way only: the
 * editor always reloads from JSON, never re-parses this Markdown.
 *
 * Supported nodes mirror the editor (StarterKit + link + tables, no cell merge):
 * headings, paragraphs, bold/italic/strike/code, links, bullet/ordered lists
 * (nested), blockquote, code blocks, horizontal rule, hard breaks, GFM tables.
 */

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

const ESCAPE_RE = /([\\`*_[\]])/g;

function escapeText(text: string): string {
  return text.replace(ESCAPE_RE, "\\$1");
}

function applyMarks(raw: string, marks: PMMark[]): string {
  const has = (t: string) => marks.some((m) => m.type === t);

  let out: string;
  if (has("code")) {
    out = `\`${raw}\``; // code spans take the raw text; no other inline styling applies
  } else {
    out = escapeText(raw);
    if (has("strike")) out = `~~${out}~~`;
    if (has("italic")) out = `*${out}*`;
    if (has("bold")) out = `**${out}**`;
  }
  if (has("link")) {
    const link = marks.find((m) => m.type === "link");
    const href = (link?.attrs?.href as string | undefined) ?? "";
    out = `[${out}](${href})`;
  }
  return out;
}

function serializeInline(nodes: PMNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "\\\n";
      if (node.type === "text") return applyMarks(node.text ?? "", node.marks ?? []);
      return "";
    })
    .join("");
}

function serializeCell(cell: PMNode): string {
  const text = (cell.content ?? [])
    .map((block) => serializeInline(block.content))
    .join(" ")
    .trim();
  // Pipes and newlines would break the single-line GFM cell.
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ") || " ";
}

function serializeTable(node: PMNode): string {
  const rows = (node.content ?? []).map((row) => (row.content ?? []).map(serializeCell));
  if (rows.length === 0) return "";
  const header = rows[0] ?? [];
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const separator = header.map(() => "---");
  return [line(header), line(separator), ...rows.slice(1).map(line)].join("\n");
}

function indentContinuation(text: string, indent: string): string {
  return text
    .split("\n")
    .map((l, i) => (i === 0 || l === "" ? l : indent + l))
    .join("\n");
}

function serializeList(node: PMNode, ordered: boolean): string {
  const start = ordered ? ((node.attrs?.start as number | undefined) ?? 1) : 1;
  return (node.content ?? [])
    .map((item, i) => {
      const marker = ordered ? `${start + i}. ` : "- ";
      const inner = serializeBlocks(item.content ?? []);
      return marker + indentContinuation(inner, " ".repeat(marker.length));
    })
    .join("\n");
}

function serializeBlock(node: PMNode): string {
  switch (node.type) {
    case "paragraph":
      return serializeInline(node.content);
    case "heading": {
      const level = (node.attrs?.level as number | undefined) ?? 1;
      return `${"#".repeat(level)} ${serializeInline(node.content)}`;
    }
    case "blockquote":
      return serializeBlocks(node.content ?? [])
        .split("\n")
        .map((l) => (l === "" ? ">" : `> ${l}`))
        .join("\n");
    case "bulletList":
      return serializeList(node, false);
    case "orderedList":
      return serializeList(node, true);
    case "codeBlock": {
      const lang = (node.attrs?.language as string | undefined) ?? "";
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    case "table":
      return serializeTable(node);
    default:
      // Unknown block: fall back to its inline content so nothing is silently lost.
      return serializeInline(node.content);
  }
}

function serializeBlocks(nodes: PMNode[]): string {
  return nodes
    .map(serializeBlock)
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/** Serialize a ProseMirror `doc` node to GFM Markdown (trailing newline). */
export function serializeToMarkdown(doc: PMNode): string {
  const body = serializeBlocks(doc.content ?? []);
  return body === "" ? "" : `${body}\n`;
}
