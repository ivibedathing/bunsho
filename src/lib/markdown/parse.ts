import MarkdownIt from "markdown-it";
import type { PMMark, PMNode } from "./serialize";

/**
 * GFM Markdown → ProseMirror JSON — the inverse of `serialize.ts`, used for
 * import (PRD §7 F11). Maps markdown-it's token stream onto the editor's node
 * set (headings, paragraphs, lists, blockquote, code, hr, tables, and the
 * bold/italic/strike/code/link marks). Imported content lands in a Draft for
 * human review, so best-effort fidelity is acceptable.
 */

const md = new MarkdownIt({ html: false, linkify: true });

// markdown-it's default validateLink rejects all `data:` URIs except a few
// raster image types, which would silently drop draw.io diagrams (editable
// SVG data URIs). Allowing them is safe: they render via <img>, where SVG
// scripts never execute.
const defaultValidateLink = md.validateLink.bind(md);
md.validateLink = (url) => defaultValidateLink(url) || /^data:image\/svg\+xml[;,]/.test(url);

function removeMark(marks: PMMark[], type: string): void {
  const i = marks.map((m) => m.type).lastIndexOf(type);
  if (i >= 0) marks.splice(i, 1);
}

interface InlineToken {
  type: string;
  content: string;
  children?: InlineToken[] | null;
  attrGet(name: string): string | null;
}

function parseInline(children: InlineToken[]): PMNode[] {
  const out: PMNode[] = [];
  const marks: PMMark[] = [];
  const withMarks = (): PMMark[] | undefined =>
    marks.length ? marks.map((m) => ({ ...m })) : undefined;

  for (const c of children) {
    switch (c.type) {
      case "text":
        if (c.content) out.push({ type: "text", text: c.content, marks: withMarks() });
        break;
      case "strong_open":
        marks.push({ type: "bold" });
        break;
      case "strong_close":
        removeMark(marks, "bold");
        break;
      case "em_open":
        marks.push({ type: "italic" });
        break;
      case "em_close":
        removeMark(marks, "italic");
        break;
      case "s_open":
        marks.push({ type: "strike" });
        break;
      case "s_close":
        removeMark(marks, "strike");
        break;
      case "code_inline":
        out.push({
          type: "text",
          text: c.content,
          marks: [...(withMarks() ?? []), { type: "code" }],
        });
        break;
      case "link_open":
        marks.push({ type: "link", attrs: { href: c.attrGet("href") ?? "" } });
        break;
      case "link_close":
        removeMark(marks, "link");
        break;
      case "image": {
        // Editable-SVG data URIs are draw.io diagrams (see serialize.ts).
        // Other images have no node in the editor schema and are dropped,
        // matching the rest of this best-effort importer.
        const src = c.attrGet("src") ?? "";
        if (/^data:image\/svg\+xml[;,]/.test(src)) {
          out.push({ type: "drawio", attrs: { svg: src } });
        }
        break;
      }
      case "softbreak":
        out.push({ type: "text", text: " ", marks: withMarks() });
        break;
      case "hardbreak":
        out.push({ type: "hardBreak" });
        break;
    }
  }
  return out;
}

/**
 * Diagrams are block atoms in the editor schema but arrive from Markdown as
 * inline images. Lift them out of the just-closed paragraph (the last child
 * of `parent`) to block-level siblings, dropping the paragraph if the
 * diagram was all it held. List items keep an empty leading paragraph, since
 * their schema requires one.
 */
function hoistDrawio(para: PMNode, parent: PMNode): void {
  const inline = para.content ?? [];
  if (!inline.some((n) => n.type === "drawio")) return;
  const rest = inline.filter((n) => n.type !== "drawio");
  const diagrams = inline.filter((n) => n.type === "drawio");
  const siblings = parent.content ?? [];
  siblings.pop(); // the paragraph itself
  if (rest.length > 0 || parent.type === "listItem") {
    siblings.push({ ...para, content: rest });
  }
  siblings.push(...diagrams);
}

export function markdownToProseMirror(source: string): PMNode {
  // biome-ignore lint/suspicious/noExplicitAny: markdown-it token typing is loose
  const tokens = md.parse(source, {}) as any[];
  const doc: PMNode = { type: "doc", content: [] };
  const stack: PMNode[] = [doc];
  const top = () => stack[stack.length - 1] as PMNode;
  const push = (node: PMNode) => {
    const t = top();
    if (!t.content) t.content = [];
    t.content.push(node);
  };
  const open = (node: PMNode) => {
    push(node);
    stack.push(node);
  };

  for (const t of tokens) {
    switch (t.type) {
      case "heading_open":
        open({ type: "heading", attrs: { level: Number(t.tag.slice(1)) }, content: [] });
        break;
      case "heading_close":
        stack.pop();
        break;
      case "paragraph_open":
        open({ type: "paragraph", content: [] });
        break;
      case "paragraph_close": {
        const para = stack.pop() as PMNode;
        hoistDrawio(para, top());
        break;
      }
      case "bullet_list_open":
        open({ type: "bulletList", content: [] });
        break;
      case "ordered_list_open": {
        const start = t.attrGet("start");
        open({ type: "orderedList", attrs: { start: start ? Number(start) : 1 }, content: [] });
        break;
      }
      case "bullet_list_close":
      case "ordered_list_close":
        stack.pop();
        break;
      case "list_item_open":
        open({ type: "listItem", content: [] });
        break;
      case "list_item_close":
        stack.pop();
        break;
      case "blockquote_open":
        open({ type: "blockquote", content: [] });
        break;
      case "blockquote_close":
        stack.pop();
        break;
      case "fence":
      case "code_block":
        push({
          type: "codeBlock",
          attrs: t.info ? { language: String(t.info).trim() } : {},
          content: t.content ? [{ type: "text", text: String(t.content).replace(/\n$/, "") }] : [],
        });
        break;
      case "hr":
        push({ type: "horizontalRule" });
        break;
      case "table_open":
        open({ type: "table", content: [] });
        break;
      case "table_close":
        stack.pop();
        break;
      case "thead_open":
      case "thead_close":
      case "tbody_open":
      case "tbody_close":
        break; // transparent — rows attach to the table
      case "tr_open":
        open({ type: "tableRow", content: [] });
        break;
      case "tr_close":
        stack.pop();
        break;
      case "th_open":
      case "td_open": {
        const cell: PMNode = {
          type: t.type === "th_open" ? "tableHeader" : "tableCell",
          content: [{ type: "paragraph", content: [] }],
        };
        push(cell);
        stack.push(cell);
        // biome-ignore lint/style/noNonNullAssertion: cell was just created with a paragraph
        stack.push(cell.content![0]!);
        break;
      }
      case "th_close":
      case "td_close":
        stack.pop(); // paragraph
        stack.pop(); // cell
        break;
      case "inline":
        for (const n of parseInline((t.children ?? []) as InlineToken[])) push(n);
        break;
    }
  }

  if (!doc.content || doc.content.length === 0) doc.content = [{ type: "paragraph" }];
  return doc;
}
