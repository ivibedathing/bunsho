"use client";

import { buildEditorExtensions } from "@/lib/editor/extensions";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";

/** Read-only WYSIWYG render of a version's content, reusing the editor schema. */
export function ReadOnlyDocument({ content }: { content: JSONContent }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: buildEditorExtensions(),
    content,
    editorProps: { attributes: { class: "bunsho-editor" } },
  });
  return <EditorContent editor={editor} />;
}
