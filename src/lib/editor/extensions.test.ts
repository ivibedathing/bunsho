import { markdownToProseMirror } from "@/lib/markdown/parse";
import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { buildEditorExtensions } from "./extensions";

/**
 * Guards the editor-schema ⇄ Markdown seam: everything the importer emits —
 * including drawio blocks hoisted out of their wrapping paragraphs — must
 * validate against the real TipTap schema, or loading a draft would throw
 * at runtime.
 */
describe("editor schema accepts importer output", () => {
  const schema = getSchema(buildEditorExtensions());
  const SVG = "data:image/svg+xml;base64,PHN2ZyAvPg==";

  const cases: Record<string, string> = {
    "top-level diagram": `![drawio](${SVG})\n`,
    "diagram beside text": `Flow: ![drawio](${SVG})\n`,
    "diagram in a blockquote": `> ![drawio](${SVG})\n`,
    "diagram alone in a list item": `- ![drawio](${SVG})\n`,
    "plain document without diagrams": "# Title\n\nBody text.\n",
  };

  for (const [name, md] of Object.entries(cases)) {
    it(name, () => {
      const json = markdownToProseMirror(md);
      expect(() => schema.nodeFromJSON(json).check()).not.toThrow();
    });
  }
});
