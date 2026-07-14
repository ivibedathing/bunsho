"use client";

import type { Editor } from "@tiptap/react";
import type { CSSProperties } from "react";

const btn: CSSProperties = {
  padding: "0.3rem 0.55rem",
  borderRadius: "0.4rem",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontSize: "0.85rem",
  cursor: "pointer",
  lineHeight: 1.2,
};
const activeBtn: CSSProperties = { ...btn, background: "var(--fg)", color: "var(--bg)" };
const sep: CSSProperties = { width: 1, alignSelf: "stretch", background: "var(--border)" };

function Btn({
  editor,
  onClick,
  active,
  title,
  children,
}: {
  editor: Editor;
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active ?? false}
      style={active ? activeBtn : btn}
      // Keep the editor selection; prevent the button from stealing focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  const inTable = editor.isActive("table");
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.3rem",
        alignItems: "center",
        padding: "0.5rem",
        position: "sticky",
        top: 0,
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        zIndex: 1,
      }}
    >
      <Btn
        editor={editor}
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </Btn>
      <Btn
        editor={editor}
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </Btn>
      <span style={sep} />
      <Btn
        editor={editor}
        title="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </Btn>
      <Btn
        editor={editor}
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </Btn>
      <Btn
        editor={editor}
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </Btn>
      <span style={sep} />
      <Btn
        editor={editor}
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </Btn>
      <Btn
        editor={editor}
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </Btn>
      <Btn
        editor={editor}
        title="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </Btn>
      <span style={sep} />
      <Btn
        editor={editor}
        title="Add or edit link"
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link URL", prev ?? "https://");
          if (url === null) return;
          if (url === "") editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        🔗 Link
      </Btn>
      <span style={sep} />
      <Btn
        editor={editor}
        title="Insert table"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        ▦ Table
      </Btn>
      {inTable && (
        <>
          <Btn
            editor={editor}
            title="Add column"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            +Col
          </Btn>
          <Btn
            editor={editor}
            title="Add row"
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            +Row
          </Btn>
          <Btn
            editor={editor}
            title="Delete column"
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            −Col
          </Btn>
          <Btn
            editor={editor}
            title="Delete row"
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            −Row
          </Btn>
          <Btn
            editor={editor}
            title="Delete table"
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            ⌫ Table
          </Btn>
        </>
      )}
    </div>
  );
}
