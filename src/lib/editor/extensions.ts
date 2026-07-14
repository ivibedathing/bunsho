import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/**
 * The single definition of the editor's capabilities — the escape hatch if we
 * ever drop to ProseMirror directly (PRD §8). StarterKit provides headings,
 * lists, bold/italic, blockquote and code; plus links and first-class tables.
 * Deliberately NO cell-merge extension — merged cells can't round-trip through
 * GFM Markdown, and faithful Markdown is a hard requirement (PRD §4.3, risk log).
 */
export function buildEditorExtensions(): Extensions {
  return [
    StarterKit,
    Link.configure({ openOnClick: false, autolink: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}
