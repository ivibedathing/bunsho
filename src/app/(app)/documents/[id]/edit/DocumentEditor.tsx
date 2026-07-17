"use client";

import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { commitAction, saveDraftAction } from "@/app/(app)/documents/actions";
import { AutosaveIndicator, type SaveStatus } from "@/components/motion/AutosaveIndicator";
import { buildEditorExtensions } from "@/lib/editor/extensions";
import { EditorToolbar } from "./EditorToolbar";

const AUTOSAVE_MS = 800;
/**
 * How long typing must settle before the draft is frozen as a version. A page has
 * no publish step (DECISIONS.md — 2026-07-17), so the commit rides an idle timer
 * instead of a button. It is deliberately much longer than AUTOSAVE_MS: every
 * commit costs a version row, an audit entry, and a commit in the git export, so
 * a session should coalesce into a handful, not one per debounce.
 */
const COMMIT_MS = 5_000;

export function DocumentEditor({
  documentId,
  initialContent,
}: {
  documentId: string;
  initialContent: JSONContent;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<JSONContent | null>(null);
  // Edits not yet frozen into a version. Tracked separately from the timer
  // handles, which stay non-null after firing — flushing on those would re-fork
  // and re-publish an identical version every time the editor unmounts.
  const uncommitted = useRef(false);

  const save = useCallback(
    async (json: JSONContent) => {
      setStatus("saving");
      try {
        // Stringified because ProseMirror attrs objects have a null prototype,
        // which React refuses to pass into a server action (the call 500s and
        // the draft is silently never saved).
        await saveDraftAction(documentId, JSON.stringify(json));
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    },
    [documentId],
  );

  // Save-then-commit, in that order and awaited: committing first would freeze
  // whatever the last debounce happened to land, losing the tail of the typing.
  const commit = useCallback(async () => {
    const json = latest.current;
    if (!json || !uncommitted.current) return;
    setStatus("saving");
    try {
      await saveDraftAction(documentId, JSON.stringify(json));
      await commitAction(documentId);
      // Only if nothing was typed while those were in flight — otherwise the
      // newer edits are genuinely uncommitted and their own timer is pending.
      if (latest.current === json) uncommitted.current = false;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }, [documentId]);

  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatch in Next.js
    extensions: buildEditorExtensions(),
    content: initialContent,
    editorProps: { attributes: { class: "bunsho-editor", spellcheck: "true" } },
    onUpdate: ({ editor }) => {
      setStatus("dirty");
      const json = editor.getJSON();
      latest.current = json;
      uncommitted.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (commitTimer.current) clearTimeout(commitTimer.current);
      saveTimer.current = setTimeout(() => void save(json), AUTOSAVE_MS);
      commitTimer.current = setTimeout(() => void commit(), COMMIT_MS);
    },
  });

  // Navigating away inside the commit window would otherwise strand the edit as
  // an open draft until the page is next opened, so flush both here. Chained,
  // not parallel, for the same ordering reason as `commit`.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (commitTimer.current) clearTimeout(commitTimer.current);
      const json = latest.current;
      if (!json || !uncommitted.current) return;
      uncommitted.current = false;
      void saveDraftAction(documentId, JSON.stringify(json)).then(() => commitAction(documentId));
    };
  }, [documentId]);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-carbon-raised shadow-[0_16px_48px_-16px_rgba(0,0,0,0.6)]">
      {editor && <EditorToolbar editor={editor} documentId={documentId} />}
      {/* The writing surface: dark sheet, light ink, focused column. */}
      <div className="bg-paper text-paper-ink">
        <div className="mx-auto max-w-[72ch] px-2 py-4 sm:px-6">
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="flex items-center justify-end border-t border-line px-4 py-2.5">
        <AutosaveIndicator status={status} />
      </div>
    </div>
  );
}
