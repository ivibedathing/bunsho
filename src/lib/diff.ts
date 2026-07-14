import { diffWords } from "diff";

export interface DiffSegment {
  value: string;
  added: boolean;
  removed: boolean;
}

/**
 * Word-level redline between two frozen Markdown snapshots (PRD §8 — jsdiff on
 * stored version content). Segments carry added/removed flags for rendering.
 */
export function diffMarkdown(from: string, to: string): DiffSegment[] {
  return diffWords(from, to).map((part) => ({
    value: part.value,
    added: part.added ?? false,
    removed: part.removed ?? false,
  }));
}
