import { diffWordsWithSpace } from "diff";

export interface DiffSegment {
  value: string;
  added: boolean;
  removed: boolean;
}

/**
 * Word-level redline between two frozen Markdown snapshots (DECISIONS.md — jsdiff on
 * stored version content). Segments carry added/removed flags for rendering.
 *
 * `diffWordsWithSpace`, not `diffWords`: only the whitespace-significant variant
 * guarantees the segments reconstruct both sides byte-for-byte. `diffWords`
 * shifts whitespace between segments to produce prettier redlines, which can add
 * or drop a space — acceptable for prose, not for an audited version comparison.
 */
export function diffMarkdown(from: string, to: string): DiffSegment[] {
  return diffWordsWithSpace(from, to).map((part) => ({
    value: part.value,
    added: part.added ?? false,
    removed: part.removed ?? false,
  }));
}
