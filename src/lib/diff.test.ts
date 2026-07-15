import { type DiffSegment, diffMarkdown } from "@/lib/diff";
import { describe, expect, it } from "vitest";

/** The `from` side of a redline: everything except the additions. */
function reconstructFrom(segments: DiffSegment[]): string {
  return segments
    .filter((s) => !s.added)
    .map((s) => s.value)
    .join("");
}

/** The `to` side of a redline: everything except the removals. */
function reconstructTo(segments: DiffSegment[]): string {
  return segments
    .filter((s) => !s.removed)
    .map((s) => s.value)
    .join("");
}

describe("diffMarkdown", () => {
  it("reports identical input as a single unchanged segment", () => {
    expect(
      diffMarkdown("The policy applies to everyone.", "The policy applies to everyone."),
    ).toEqual([{ value: "The policy applies to everyone.", added: false, removed: false }]);
  });

  it("normalizes jsdiff's undefined flags to false", () => {
    // jsdiff leaves added/removed undefined on unchanged parts; the wrapper's job
    // is to make every segment carry real booleans for rendering.
    for (const segment of diffMarkdown("shared prefix alpha", "shared prefix beta")) {
      expect(typeof segment.added).toBe("boolean");
      expect(typeof segment.removed).toBe("boolean");
    }
  });

  it("marks a pure addition as added, with nothing removed", () => {
    const segments = diffMarkdown("Wear gloves.", "Wear gloves. Wear goggles.");

    expect(segments.some((s) => s.removed)).toBe(false);
    expect(segments.filter((s) => s.added).map((s) => s.value.trim())).toEqual(["Wear goggles."]);
  });

  it("marks a pure removal as removed, with nothing added", () => {
    const segments = diffMarkdown("Wear gloves. Wear goggles.", "Wear gloves.");

    expect(segments.some((s) => s.added)).toBe(false);
    expect(segments.filter((s) => s.removed).map((s) => s.value.trim())).toEqual(["Wear goggles."]);
  });

  it("renders a word-level replacement as a removed word plus an added word", () => {
    const segments = diffMarkdown("The quick brown fox", "The quick red fox");

    expect(segments.filter((s) => s.removed).map((s) => s.value.trim())).toEqual(["brown"]);
    expect(segments.filter((s) => s.added).map((s) => s.value.trim())).toEqual(["red"]);
    // The untouched words survive as unchanged context, not as churn.
    const unchanged = segments.filter((s) => !s.added && !s.removed).map((s) => s.value);
    expect(unchanged.join("")).toContain("The quick");
    expect(unchanged.join("")).toContain("fox");
  });

  it("treats empty-to-content as a single addition", () => {
    const segments = diffMarkdown("", "# New policy");

    expect(segments.every((s) => s.added)).toBe(true);
    expect(reconstructTo(segments)).toBe("# New policy");
    expect(reconstructFrom(segments)).toBe("");
  });

  it("treats content-to-empty as a single removal", () => {
    const segments = diffMarkdown("# Old policy", "");

    expect(segments.every((s) => s.removed)).toBe(true);
    expect(reconstructFrom(segments)).toBe("# Old policy");
    expect(reconstructTo(segments)).toBe("");
  });

  it("reports an empty-to-empty diff as a single empty unchanged segment", () => {
    // jsdiff emits one zero-length unchanged part rather than an empty list.
    expect(diffMarkdown("", "")).toEqual([{ value: "", added: false, removed: false }]);
  });
});

describe("diffMarkdown round-trip invariant", () => {
  // The property a redline renderer depends on: dropping the additions must
  // rebuild the old text exactly, and dropping the removals the new text.
  const cases: Array<[name: string, from: string, to: string]> = [
    ["identical", "Section 1\n\nBody text.", "Section 1\n\nBody text."],
    ["addition", "Step one.", "Step one. Step two."],
    ["removal", "Step one. Step two.", "Step one."],
    ["replacement", "Approved by Alice.", "Approved by Bob."],
    ["empty to content", "", "Anything at all."],
    ["content to empty", "Anything at all.", ""],
    ["multi-line markdown", "# Title\n\n- a\n- b\n", "# Title\n\n- a\n- c\n- d\n"],
    ["punctuation churn", "Do not touch (ever).", "Do not touch [ever]!"],
    ["complete rewrite", "alpha beta gamma", "delta epsilon zeta"],
  ];

  for (const [name, from, to] of cases) {
    it(`reconstructs both sides — ${name}`, () => {
      const segments = diffMarkdown(from, to);
      expect(reconstructFrom(segments)).toBe(from);
      expect(reconstructTo(segments)).toBe(to);
    });
  }

  it("never marks a segment as both added and removed", () => {
    const segments = diffMarkdown("one two three four", "one TWO three FOUR five");
    expect(segments.some((s) => s.added && s.removed)).toBe(false);
  });
});
