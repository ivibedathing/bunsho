import { describe, expect, it } from "vitest";
import { type PMNode, serializeToMarkdown } from "./serialize";

const doc = (...content: PMNode[]): PMNode => ({ type: "doc", content });
const p = (...content: PMNode[]): PMNode => ({ type: "paragraph", content });
const text = (t: string, marks?: PMNode["marks"]): PMNode => ({ type: "text", text: t, marks });

describe("serializeToMarkdown", () => {
  it("serializes headings and paragraphs", () => {
    expect(
      serializeToMarkdown(
        doc(
          { type: "heading", attrs: { level: 1 }, content: [text("Title")] },
          p(text("Hello world.")),
        ),
      ),
    ).toBe("# Title\n\nHello world.\n");
  });

  it("applies inline marks", () => {
    expect(serializeToMarkdown(doc(p(text("bold", [{ type: "bold" }]))))).toBe("**bold**\n");
    expect(serializeToMarkdown(doc(p(text("em", [{ type: "italic" }]))))).toBe("*em*\n");
    expect(serializeToMarkdown(doc(p(text("c", [{ type: "code" }]))))).toBe("`c`\n");
    expect(serializeToMarkdown(doc(p(text("s", [{ type: "strike" }]))))).toBe("~~s~~\n");
  });

  it("serializes links, wrapping any formatting", () => {
    expect(
      serializeToMarkdown(
        doc(p(text("site", [{ type: "bold" }, { type: "link", attrs: { href: "https://x.io" } }]))),
      ),
    ).toBe("[**site**](https://x.io)\n");
  });

  it("escapes Markdown-significant characters in plain text", () => {
    expect(serializeToMarkdown(doc(p(text("a*b_c`d[e]"))))).toBe("a\\*b\\_c\\`d\\[e\\]\n");
  });

  it("does not escape inside code spans", () => {
    expect(serializeToMarkdown(doc(p(text("a*b", [{ type: "code" }]))))).toBe("`a*b`\n");
  });

  it("serializes bullet and ordered lists", () => {
    const bullet = doc({
      type: "bulletList",
      content: [
        { type: "listItem", content: [p(text("one"))] },
        { type: "listItem", content: [p(text("two"))] },
      ],
    });
    expect(serializeToMarkdown(bullet)).toBe("- one\n- two\n");

    const ordered = doc({
      type: "orderedList",
      attrs: { start: 1 },
      content: [
        { type: "listItem", content: [p(text("first"))] },
        { type: "listItem", content: [p(text("second"))] },
      ],
    });
    expect(serializeToMarkdown(ordered)).toBe("1. first\n2. second\n");
  });

  it("indents nested list content under its marker", () => {
    const nested = doc({
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            p(text("parent")),
            { type: "bulletList", content: [{ type: "listItem", content: [p(text("child"))] }] },
          ],
        },
      ],
    });
    expect(serializeToMarkdown(nested)).toBe("- parent\n\n  - child\n");
  });

  it("serializes a GFM table with header + separator", () => {
    const table = doc({
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [p(text("Control"))] },
            { type: "tableHeader", content: [p(text("Owner"))] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [p(text("MFA"))] },
            { type: "tableCell", content: [p(text("IT"))] },
          ],
        },
      ],
    });
    expect(serializeToMarkdown(table)).toBe("| Control | Owner |\n| --- | --- |\n| MFA | IT |\n");
  });

  it("escapes pipes inside table cells", () => {
    const table = doc({
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [p(text("a|b"))] }] },
      ],
    });
    expect(serializeToMarkdown(table)).toBe("| a\\|b |\n| --- |\n");
  });

  it("serializes blockquote and code block", () => {
    expect(serializeToMarkdown(doc({ type: "blockquote", content: [p(text("quoted"))] }))).toBe(
      "> quoted\n",
    );
    expect(
      serializeToMarkdown(
        doc({ type: "codeBlock", attrs: { language: "ts" }, content: [text("const x = 1;")] }),
      ),
    ).toBe("```ts\nconst x = 1;\n```\n");
  });

  it("is deterministic and byte-identical across runs", () => {
    const d = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("H")] },
      p(text("x", [{ type: "bold" }, { type: "italic" }])),
    );
    expect(serializeToMarkdown(d)).toBe(serializeToMarkdown(d));
  });

  it("returns empty string for an empty doc", () => {
    expect(serializeToMarkdown(doc(p()))).toBe("");
  });
});
