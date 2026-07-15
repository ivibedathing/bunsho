"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Table,
  TextQuote,
  Trash2,
  Workflow,
} from "lucide-react";
import { type ReactNode, useRef } from "react";
import { uploadEditorImageAction } from "@/app/(app)/documents/actions";

function Btn({
  onClick,
  active,
  title,
  wide = false,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active ?? false}
      // Keep the editor selection; prevent the button from stealing focus.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`${
        wide ? "h-8 px-2 font-mono text-xs" : "grid size-8 place-items-center"
      } cursor-pointer rounded-control border-0 transition-colors duration-150 ${
        active
          ? "bg-gold-wash text-gold"
          : "bg-transparent text-ink-muted hover:bg-gold-wash/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-line" />;
}

const ICON = { size: 16, strokeWidth: 1.75 } as const;

export function EditorToolbar({ editor, documentId }: { editor: Editor; documentId: string }) {
  const inTable = editor.isActive("table");
  const imageInput = useRef<HTMLInputElement>(null);

  async function uploadImage(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadEditorImageAction(documentId, fd);
    if ("error" in result) {
      window.alert(result.error);
      return;
    }
    editor.chain().focus().setImage({ src: result.url, alt: file.name }).run();
  }

  return (
    <div className="sticky top-[3.75rem] z-10 flex flex-wrap items-center gap-0.5 border-b border-line bg-carbon-raised/90 px-2 py-1.5 backdrop-blur md:top-0">
      <Btn
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold {...ICON} aria-hidden />
      </Btn>
      <Btn
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic {...ICON} aria-hidden />
      </Btn>
      <Sep />
      <Btn
        title="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 {...ICON} aria-hidden />
      </Btn>
      <Btn
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 {...ICON} aria-hidden />
      </Btn>
      <Btn
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 {...ICON} aria-hidden />
      </Btn>
      <Sep />
      <Btn
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List {...ICON} aria-hidden />
      </Btn>
      <Btn
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered {...ICON} aria-hidden />
      </Btn>
      <Btn
        title="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <TextQuote {...ICON} aria-hidden />
      </Btn>
      <Sep />
      <Btn
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
        <Link2 {...ICON} aria-hidden />
      </Btn>
      <Btn title="Insert image" onClick={() => imageInput.current?.click()}>
        <ImagePlus {...ICON} aria-hidden />
      </Btn>
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-selecting the same file
          if (file) void uploadImage(file);
        }}
      />
      <Btn
        title="Insert diagram"
        active={editor.isActive("drawio")}
        onClick={() => editor.chain().focus().insertDrawio().run()}
      >
        <Workflow {...ICON} aria-hidden />
      </Btn>
      <Sep />
      <Btn
        title="Insert table"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        <Table {...ICON} aria-hidden />
      </Btn>
      {inTable && (
        <>
          <Btn
            wide
            title="Add column"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            +Col
          </Btn>
          <Btn wide title="Add row" onClick={() => editor.chain().focus().addRowAfter().run()}>
            +Row
          </Btn>
          <Btn
            wide
            title="Delete column"
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            −Col
          </Btn>
          <Btn wide title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>
            −Row
          </Btn>
          <Btn title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>
            <Trash2 {...ICON} aria-hidden />
          </Btn>
        </>
      )}
    </div>
  );
}
