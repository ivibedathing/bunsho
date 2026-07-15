"use client";

import { Node } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * draw.io diagrams as first-class blocks (PRD §4.3 fidelity rules apply).
 *
 * A diagram is stored as ONE string: the "editable SVG" (xmlsvg) that draw.io
 * exports — an SVG data URI whose `content` attribute carries the source
 * mxfile XML. That single value is simultaneously the rendered image and the
 * re-editable source, and it round-trips through GFM Markdown as a plain
 * image: `![drawio](data:image/svg+xml;base64,…)`.
 *
 * Editing happens in an embedded draw.io (JSON postMessage protocol,
 * https://www.drawio.com/doc/faq/embed-mode) served same-origin from
 * `public/drawio/` (vendored by scripts/fetch-drawio.ts), so the feature
 * works air-gapped with zero external network access; `stealth=1` stops the
 * editor itself from calling out. NEXT_PUBLIC_DRAWIO_URL (build-time) can
 * point at a different draw.io deployment instead.
 */

const DRAWIO_BASE = process.env.NEXT_PUBLIC_DRAWIO_URL ?? "/drawio/index.html";
const DRAWIO_PARAMS = "?embed=1&proto=json&spin=1&ui=dark&saveAndExit=1&stealth=1";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    drawio: {
      /** Insert an empty diagram block; its node view opens the editor immediately. */
      insertDrawio: () => ReturnType;
    };
  }
}

export const Drawio = Node.create({
  name: "drawio",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      svg: {
        default: null,
        parseHTML: (el: HTMLElement) => el.querySelector("img")?.getAttribute("src") ?? null,
        // Rendered via the <img> child below, not as a figure attribute.
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-drawio]" }];
  },

  renderHTML({ node }) {
    const svg = node.attrs.svg as string | null;
    if (!svg) return ["figure", { "data-drawio": "" }];
    return ["figure", { "data-drawio": "" }, ["img", { src: svg, alt: "Diagram" }]];
  },

  addCommands() {
    return {
      insertDrawio:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { svg: null } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawioNodeView);
  },
});

function DrawioNodeView({ node, editor, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const svg = node.attrs.svg as string | null;
  // A just-inserted diagram has nothing to show — go straight to the editor.
  const [editing, setEditing] = useState(svg === null && editor.isEditable);

  const save = useCallback(
    (dataUri: string) => {
      updateAttributes({ svg: dataUri });
      setEditing(false);
    },
    [updateAttributes],
  );

  const close = useCallback(() => {
    setEditing(false);
    // Cancelling before anything was drawn leaves nothing worth keeping.
    if (node.attrs.svg === null) deleteNode();
  }, [node.attrs.svg, deleteNode]);

  return (
    <NodeViewWrapper className="group relative my-4" data-drawio data-drag-handle>
      {svg ? (
        <img
          src={svg}
          alt="Diagram"
          draggable={false}
          onDoubleClick={editor.isEditable ? () => setEditing(true) : undefined}
          // The exported SVG styles itself with light-dark(); [color-scheme:dark]
          // makes it render its dark variant to match the surrounding UI.
          className={`mx-auto block h-auto max-w-full rounded-control bg-carbon p-3 [color-scheme:dark] ${
            selected ? "outline outline-2 outline-gold" : ""
          }`}
        />
      ) : (
        <div className="grid min-h-24 place-items-center rounded-control border border-line border-dashed text-ink-muted text-sm">
          Empty diagram
        </div>
      )}
      {editor.isEditable && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute top-2 right-2 cursor-pointer rounded-control border border-line bg-carbon-raised px-2.5 py-1 font-mono text-ink-muted text-xs opacity-0 transition-opacity duration-150 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          Edit diagram
        </button>
      )}
      {editing && <DrawioOverlay initialSvg={svg} onSave={save} onClose={close} />}
    </NodeViewWrapper>
  );
}

/** Full-screen embedded draw.io speaking its JSON postMessage protocol. */
function DrawioOverlay({
  initialSvg,
  onSave,
  onClose,
}: {
  initialSvg: string | null;
  onSave: (dataUri: string) => void;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Resolve the (possibly relative, same-origin) editor URL in the browser;
  // this component only ever mounts client-side.
  const { src, origin } = useMemo(() => {
    const url = new URL(`${DRAWIO_BASE}${DRAWIO_PARAMS}`, window.location.origin);
    return { src: url.toString(), origin: url.origin };
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return;
      if (typeof e.data !== "string" || !e.data.startsWith("{")) return;
      let msg: { event?: string; data?: unknown };
      try {
        msg = JSON.parse(e.data) as { event?: string; data?: unknown };
      } catch {
        return;
      }
      const post = (m: Record<string, unknown>) =>
        frame.current?.contentWindow?.postMessage(JSON.stringify(m), origin);

      switch (msg.event) {
        case "init":
          // An editable-SVG data URI is a valid `xml` payload for load.
          post({ action: "load", xml: initialSvg ?? "", autosave: 0 });
          break;
        case "save":
          // Ask for the editable SVG back; the answer arrives as "export".
          post({ action: "export", format: "xmlsvg" });
          break;
        case "export":
          if (typeof msg.data === "string") onSave(msg.data);
          break;
        case "exit":
          onClose();
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, initialSvg, onSave, onClose]);

  return createPortal(
    // biome-ignore lint/a11y/useSemanticElements: native <dialog> modality would fight the editor's focus management; draw.io manages focus inside the iframe
    <div
      role="dialog"
      aria-label="Diagram editor"
      className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm sm:p-6"
    >
      <div className="h-full w-full overflow-hidden rounded-card border border-line bg-carbon-raised shadow-[0_16px_48px_-16px_rgba(0,0,0,0.8)]">
        <iframe
          ref={frame}
          title="draw.io diagram editor"
          src={src}
          className="h-full w-full border-0"
        />
      </div>
    </div>,
    document.body,
  );
}
