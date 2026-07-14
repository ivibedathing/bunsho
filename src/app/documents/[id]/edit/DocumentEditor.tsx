"use client";

import { saveDraftAction } from "@/app/documents/actions";
import { buildEditorExtensions } from "@/lib/editor/extensions";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorToolbar } from "./EditorToolbar";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "All changes saved",
  dirty: "Unsaved changes…",
  saving: "Saving…",
  saved: "All changes saved",
  error: "Couldn’t save — retrying on next edit",
};

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
        await saveDraftAction(documentId, json);
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
        if (editor) void saveDraftAction(documentId, editor.getJSON());
      }
    };
  }, [editor, documentId]);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "0.6rem", overflow: "hidden" }}>
      {editor && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
      <div
        style={{
          padding: "0.4rem 0.75rem",
          borderTop: "1px solid var(--border)",
          fontSize: "0.8rem",
          color: status === "error" ? "#dc2626" : "var(--muted)",
        }}
        aria-live="polite"
      >
        {STATUS_LABEL[status]}
      </div>
    </div>
  );
}
