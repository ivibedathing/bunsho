/**
 * Document codes are the human-facing stable identifier for a controlled
 * document (e.g. `POL-007`, `SOP-013`). Format: an uppercase alpha prefix,
 * a hyphen, then a zero-padded number. Enforced at the app layer so codes
 * stay consistent across the repository and in the git/Markdown export.
 */
const DOC_CODE_RE = /^[A-Z]{2,6}-\d{3,}$/;

export function isValidDocCode(code: string): boolean {
  return DOC_CODE_RE.test(code);
}

/**
 * Normalize user input toward a canonical doc code: trim, uppercase, and
 * collapse internal whitespace around the hyphen. Does not validate — pair
 * with {@link isValidDocCode}.
 */
export function normalizeDocCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/, "-")
    .replace(/\s+/g, "-");
}
