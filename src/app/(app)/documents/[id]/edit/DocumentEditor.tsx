"use client";

import { saveDraftAction } from "@/app/(app)/documents/actions";
import { AutosaveIndicator, type SaveStatus } from "@/components/motion/AutosaveIndicator";
import { buildEditorExtensions } from "@/lib/editor/extensions";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorToolbar } from "./EditorToolbar";

const AUTOSAVE_MS = 800;

export function DocumentEditor({
  documentId,
  initialContent,
}: {
  documentId: string;
  initialContent: JSONContent;
}) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const editor = useEditor({
    immediatelyRender: false, // avoid SSR hydration mismatch in Next.js
    extensions: buildEditorExtensions(),
    content: initialContent,
    editorProps: { attributes: { class: "bunsho-editor", spellcheck: "true" } },
    onUpdate: ({ editor }) => {
      setStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      const json = editor.getJSON();
      timer.current = setTimeout(() => void save(json), AUTOSAVE_MS);
    },
  });

  // Flush a pending save if the user navigates away mid-debounce.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (editor) void saveDraftAction(documentId, JSON.stringify(editor.getJSON()));
      }
    };
  }, [editor, documentId]);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-carbon-raised shadow-[0_16px_48px_-16px_rgba(0,0,0,0.6)]">
      {editor && <EditorToolbar editor={editor} />}
      {/* The writing surface: cream paper, dark ink, focused column. */}
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
