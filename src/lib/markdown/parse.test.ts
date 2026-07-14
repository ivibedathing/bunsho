import { describe, expect, it } from "vitest";
import { markdownToProseMirror } from "./parse";
import { type PMNode, serializeToMarkdown } from "./serialize";

function types(node: PMNode): string[] {
  return (node.content ?? []).map((n) => n.type);
}

describe("markdownToProseMirror", () => {
  it("parses headings and paragraphs", () => {
    const doc = markdownToProseMirror("# Title\n\nHello world.");
    expect(types(doc)).toEqual(["heading", "paragraph"]);
    expect(doc.content?.[0]?.attrs?.level).toBe(1);
  });

  it("parses inline marks", () => {
    const doc = markdownToProseMirror("**bold** *em* `code`");
    const para = doc.content?.[0];
    const marks = (para?.content ?? []).map((n) => n.marks?.map((m) => m.type).join("+") ?? "");
    expect(marks).toContain("bold");
    expect(marks).toContain("italic");
    expect(marks).toContain("code");
  });

  it("parses links with href", () => {
    const doc = markdownToProseMirror("[site](https://x.io)");
    const text = doc.content?.[0]?.content?.[0];
    expect(text?.marks?.find((m) => m.type === "link")?.attrs?.href).toBe("https://x.io");
  });

  it("parses lists", () => {
    const doc = markdownToProseMirror("- one\n- two");
    expect(doc.content?.[0]?.type).toBe("bulletList");
    expect(doc.content?.[0]?.content).toHaveLength(2);
  });

  it("parses a GFM table into table/row/cell nodes", () => {
    const doc = markdownToProseMirror("| A | B |\n| --- | --- |\n| 1 | 2 |");
    const table = doc.content?.[0];
    expect(table?.type).toBe("table");
    expect(table?.content?.[0]?.type).toBe("tableRow");
    expect(table?.content?.[0]?.content?.[0]?.type).toBe("tableHeader");
  });

  it("never returns an empty doc", () => {
    expect(markdownToProseMirror("").content).toEqual([{ type: "paragraph" }]);
  });
});

describe("serialize ∘ parse round-trip", () => {
  const cases = [
    "# Access Control Policy\n\nAll access requires MFA.\n",
    "- one\n- two\n",
    "1. first\n2. second\n",
    "**bold** and *italic* text.\n",
    "> quoted line\n",
    "| Control | Owner |\n| --- | --- |\n| MFA | IT |\n",
  ];
  for (const md of cases) {
    it(`stabilizes: ${JSON.stringify(md.slice(0, 24))}…`, () => {
      const once = serializeToMarkdown(markdownToProseMirror(md));
      const twice = serializeToMarkdown(markdownToProseMirror(once));
      expect(twice).toBe(once); // parsing is idempotent through the serializer
    });
  }
});
