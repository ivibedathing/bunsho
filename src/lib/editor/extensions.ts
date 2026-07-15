import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Drawio } from "./drawio";

/**
 * The single definition of the editor's capabilities — the escape hatch if we
 * ever drop to ProseMirror directly (DECISIONS.md). StarterKit provides headings,
 * lists, bold/italic, blockquote and code; plus links, first-class tables,
 * inline images (uploaded as document attachments, referenced by URL), and
 * draw.io diagram blocks (stored as editable-SVG data URIs, so they round-trip
 * through Markdown as plain images). Deliberately NO cell-merge extension —
 * merged cells can't round-trip through GFM Markdown, and faithful Markdown is
 * a hard requirement (DECISIONS.md).
 */
export function buildEditorExtensions(): Extensions {
  return [
    StarterKit,
    Link.configure({ openOnClick: false, autolink: true }),
    // `inline: true` keeps images inside paragraphs, matching GFM `![alt](src)`
    // so they round-trip through the pinned Markdown serializer.
    Image.configure({ inline: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Drawio,
  ];
}
