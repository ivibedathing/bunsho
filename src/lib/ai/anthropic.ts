import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin, env-gated wrapper over the Anthropic API (DECISIONS.md — SDK called from the
 * app, suggestion-only, outbound HTTPS, cleanly disableable). AI features are OFF
 * unless `ANTHROPIC_API_KEY` is set and `AI_ENABLED` is not "false".
 *
 * The model defaults to claude-opus-4-8 (override with `AI_MODEL`). Output is
 * always a *suggestion*: nothing here mutates a document — callers route results
 * into the suggestions queue for human accept/reject.
 */

const MODEL = process.env.AI_MODEL ?? "claude-opus-4-8";

export class AiDisabledError extends Error {
  constructor() {
    super("AI features are disabled (set ANTHROPIC_API_KEY and AI_ENABLED).");
    this.name = "AiDisabledError";
  }
}

export function isAiEnabled(): boolean {
  return process.env.AI_ENABLED !== "false" && !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!isAiEnabled()) throw new AiDisabledError();
  if (!client) client = new Anthropic();
  return client;
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** One-paragraph summary of a document's frozen Markdown (F8a). */
export async function summarizeMarkdown(markdown: string): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "You summarize controlled quality/compliance documents. Return a single, plain-language paragraph capturing the document's purpose and key points. No preamble.",
    messages: [{ role: "user", content: `Summarize this document:\n\n${markdown}` }],
  });
  return textOf(res);
}

/**
 * Review a document for clarity, consistency, and completeness (F8c). Returns
 * reviewer-style notes as Markdown bullet points; surfaced as an advisory
 * suggestion for a human to act on.
 */
export async function reviewMarkdown(markdown: string): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      "You review controlled quality/compliance documents for clarity, internal consistency, and completeness. Return concise, specific findings as Markdown bullet points, each naming the issue and a suggested fix. If the document is sound, say so briefly. Do not rewrite the document.",
    messages: [{ role: "user", content: `Review this document:\n\n${markdown}` }],
  });
  return textOf(res);
}
