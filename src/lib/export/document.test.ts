import { describe, expect, it } from "vitest";
import { changeLogTable, documentToMarkdown, frontMatter } from "./document";

const publishedAt = new Date("2026-07-14T12:00:00.000Z");

describe("frontMatter", () => {
  it("emits quoted YAML scalars and skips empty optionals", () => {
    expect(
      frontMatter({
        docCode: "POL-007",
        title: "Access: Control",
        version: 3,
        publishedAt,
      }),
    ).toBe(
      [
        "---",
        'code: "POL-007"',
        'title: "Access: Control"',
        "version: 3",
        "published: 2026-07-14T12:00:00.000Z",
        "---",
      ].join("\n"),
    );
  });

  it("escapes quotes in titles", () => {
    expect(
      frontMatter({
        docCode: "X",
        title: 'A "quoted" title',
        version: 1,
        publishedAt,
      }),
    ).toContain('title: "A \\"quoted\\" title"');
  });
});

describe("changeLogTable", () => {
  it("renders a GFM table sorted by version", () => {
    const table = changeLogTable([
      { version: 2, publishedAt, changeNote: "Update", author: "Ada" },
      { version: 1, publishedAt, changeNote: null, author: "Ada" },
    ]);
    expect(table).toBe(
      [
        "## Change log",
        "",
        "| Version | Date | Change | Author |",
        "| --- | --- | --- | --- |",
        "| v1 | 2026-07-14 |  | Ada |",
        "| v2 | 2026-07-14 | Update | Ada |",
      ].join("\n"),
    );
  });
});

describe("documentToMarkdown", () => {
  it("assembles front matter + body + change log deterministically", () => {
    const out = documentToMarkdown({
      meta: {
        docCode: "POL-007",
        title: "Access",
        version: 1,
        publishedAt,
        author: "Ada",
        changeNote: "Initial",
      },
      bodyMarkdown: "# Access\n\nBody text.",
      changeLog: [{ version: 1, publishedAt, changeNote: "Initial", author: "Ada" }],
    });
    expect(out).toContain('code: "POL-007"');
    expect(out).toContain("# Access\n\nBody text.");
    expect(out).toContain("## Change log");
    expect(out.endsWith("\n")).toBe(true);
    // Deterministic
    expect(out).toBe(
      documentToMarkdown({
        meta: {
          docCode: "POL-007",
          title: "Access",
          version: 1,
          publishedAt,
          author: "Ada",
          changeNote: "Initial",
        },
        bodyMarkdown: "# Access\n\nBody text.",
        changeLog: [{ version: 1, publishedAt, changeNote: "Initial", author: "Ada" }],
      }),
    );
  });
});
