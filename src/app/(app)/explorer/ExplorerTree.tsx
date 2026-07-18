"use client";

import { ChevronRight, FileText, FolderClosed, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type DragEvent, useState, useTransition } from "react";
import { moveDocumentAction, renameFolderAction } from "@/app/(app)/documents/actions";
import { Button } from "@/components/ui/Button";
import { DocCode } from "@/components/ui/DocCode";
import { Input } from "@/components/ui/Field";
import { StatusSeal } from "@/components/ui/StatusSeal";
import { countPages, type ExplorerFolder, type ExplorerPage } from "@/lib/explorer-tree";

/**
 * The hierarchy, rendered with <details>/<summary> so folders and pages collapse
 * with almost no client JS. The one interactive layer is drag-and-drop: a manager
 * drags a page onto a folder to re-file it (DECISIONS.md — 2026-07-18). Rows are
 * drag sources; folder and "Unfiled" summaries are drop targets. Everything else
 * — rename, subpage links, collapse — stays declarative.
 *
 * Rename travels through the URL, the way the search filters do: the pencil links
 * to `?rename={id}`, and the folder it names swaps its row for an edit form. Which
 * is also why that one folder sheds its <details> wrapper — a form inside a
 * <summary> toggles the disclosure on every click into the input.
 */

/** Custom MIME so drop targets ignore stray drags (text, links, files). */
const DOC_MIME = "application/x-bunsho-doc-id";

const ROW =
  "group flex items-center gap-2.5 rounded-control px-2 py-1.5 transition-colors hover:bg-gold-wash/40";
const TWISTY =
  "size-4 shrink-0 text-ink-muted transition-transform duration-150 group-open/node:rotate-90";
const NEST = "ml-[1.0625rem] border-l border-line/50 pl-3";
const ICON_ACTION =
  "shrink-0 rounded-control p-1 text-ink-muted no-underline opacity-0 transition-colors " +
  "hover:bg-gold-wash hover:text-gold focus-visible:opacity-100 group-hover:opacity-100";
/** Folder summary while a compatible page hovers over it. */
const DROP_OVER = "ring-1 ring-gold ring-inset bg-gold-wash/60";

interface TreeProps {
  /** Admins and Editors get the create, rename, and move affordances; Viewers read only. */
  canManage: boolean;
  /** The folder being renamed, from `?rename=`. */
  renameId?: string;
}

/** Drag source: makes a page row grabbable and carry its id. Off for Viewers. */
function useDocDrag(docId: string, enabled: boolean) {
  const [dragging, setDragging] = useState(false);
  if (!enabled) return { dragging: false, dragProps: {} };
  return {
    dragging,
    dragProps: {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData(DOC_MIME, docId);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      },
      onDragEnd: () => setDragging(false),
    },
  };
}

/** Drop target: re-files the dropped page into `folderId` (null = out to top level). */
function useDocDrop(folderId: string | null, enabled: boolean) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [over, setOver] = useState(false);
  if (!enabled) return { over: false, pending: false, dropProps: {} };
  return {
    over,
    pending,
    dropProps: {
      onDragOver: (e: DragEvent) => {
        // Only react to page drags — never let a folder read a link or file drop.
        if (!e.dataTransfer.types.includes(DOC_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        const docId = e.dataTransfer.getData(DOC_MIME);
        if (!docId) return;
        e.preventDefault();
        e.stopPropagation(); // deepest folder wins; don't also unfile at the root
        setOver(false);
        startTransition(async () => {
          await moveDocumentAction(docId, folderId);
          router.refresh();
        });
      },
    },
  };
}

/** Keeps childless rows aligned with rows that have a twisty. */
function TwistySpacer() {
  return <span className="size-4 shrink-0" aria-hidden />;
}

function SubpageLink({ id, label }: { id: string; label: string }) {
  return (
    <Link
      href={`/documents/new?parent=${id}`}
      title={label}
      aria-label={label}
      draggable={false}
      className={`ml-auto ${ICON_ACTION}`}
    >
      <Plus size={14} strokeWidth={2} aria-hidden />
    </Link>
  );
}

function PageRow({ page, canManage }: { page: ExplorerPage } & TreeProps) {
  return (
    <>
      <FileText size={15} strokeWidth={1.75} className="shrink-0 text-ink-muted" aria-hidden />
      <Link
        href={`/documents/${page.id}`}
        draggable={false}
        className="truncate text-sm text-ink no-underline hover:text-gold"
      >
        {page.title}
      </Link>
      <DocCode code={page.docCode} className="shrink-0" />
      {page.status === "retired" && <StatusSeal status="retired" />}
      {canManage && <SubpageLink id={page.id} label={`New subpage under ${page.title}`} />}
    </>
  );
}

function PageNode({ page, ...tree }: { page: ExplorerPage } & TreeProps) {
  const { dragging, dragProps } = useDocDrag(page.id, tree.canManage);
  const dim = dragging ? "opacity-50" : "";

  if (page.children.length === 0) {
    return (
      <li>
        <div className={`${ROW} ${dim}`} {...dragProps}>
          <TwistySpacer />
          <PageRow page={page} {...tree} />
        </div>
      </li>
    );
  }

  const total = countPages(page) - 1;
  return (
    <li>
      <details open className="group/node">
        <summary
          className={`${ROW} ${dim} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
          {...dragProps}
        >
          <ChevronRight className={TWISTY} strokeWidth={2} aria-hidden />
          <PageRow page={page} {...tree} />
          <span className="shrink-0 text-xs text-ink-muted tabular-nums">
            {total} {total === 1 ? "subpage" : "subpages"}
          </span>
        </summary>
        <ul className={`m-0 grid list-none gap-0.5 p-0 ${NEST}`}>
          {page.children.map((c) => (
            <PageNode key={c.id} page={c} {...tree} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/** A folder's contents — shared by the normal and the renaming render. */
function FolderChildren({ folder, ...tree }: { folder: ExplorerFolder } & TreeProps) {
  const isEmpty = folder.pages.length === 0 && folder.folders.length === 0;
  return (
    <ul className={`m-0 grid list-none gap-0.5 p-0 ${NEST}`}>
      {folder.folders.map((f) => (
        <FolderNode key={f.id} folder={f} {...tree} />
      ))}
      {folder.pages.map((p) => (
        <PageNode key={p.id} page={p} {...tree} />
      ))}
      {isEmpty && <li className="px-2 py-1.5 text-sm text-ink-muted italic">Empty folder</li>}
    </ul>
  );
}

function FolderNode({ folder, ...tree }: { folder: ExplorerFolder } & TreeProps) {
  const pages = folder.pages.reduce((n, p) => n + countPages(p), 0);
  const { over, dropProps } = useDocDrop(folder.id, tree.canManage);

  if (tree.canManage && tree.renameId === folder.id) {
    return (
      <li>
        <div className={`${ROW} bg-gold-wash/30`}>
          <TwistySpacer />
          <FolderClosed size={15} strokeWidth={1.75} className="shrink-0 text-gold" aria-hidden />
          <form action={renameFolderAction} className="flex flex-1 items-center gap-2">
            <input type="hidden" name="folderId" value={folder.id} />
            <Input
              name="name"
              defaultValue={folder.name}
              aria-label={`Rename ${folder.name}`}
              required
              autoFocus
              className="flex-1 py-1"
            />
            <Button type="submit" variant="primary" size="sm">
              Save
            </Button>
            <Button href="/explorer" variant="ghost" size="sm">
              Cancel
            </Button>
          </form>
        </div>
        <FolderChildren folder={folder} {...tree} />
      </li>
    );
  }

  return (
    <li>
      <details open className="group/node">
        <summary
          className={`${ROW} cursor-pointer list-none [&::-webkit-details-marker]:hidden ${over ? DROP_OVER : ""}`}
          {...dropProps}
        >
          <ChevronRight className={TWISTY} strokeWidth={2} aria-hidden />
          <FolderClosed size={15} strokeWidth={1.75} className="shrink-0 text-gold" aria-hidden />
          <span className="truncate font-medium text-sm text-ink">{folder.name}</span>
          <span className="ml-auto shrink-0 text-xs text-ink-muted tabular-nums">
            {pages || "—"}
          </span>
          {tree.canManage && (
            <Link
              href={`/explorer?rename=${folder.id}`}
              title={`Rename ${folder.name}`}
              aria-label={`Rename ${folder.name}`}
              draggable={false}
              className={ICON_ACTION}
            >
              <Pencil size={14} strokeWidth={2} aria-hidden />
            </Link>
          )}
        </summary>
        <FolderChildren folder={folder} {...tree} />
      </details>
    </li>
  );
}

/** The "Unfiled" bucket, also the drop target for moving a page out to top level. */
function UnfiledNode({ unfiled, ...tree }: { unfiled: ExplorerPage[] } & TreeProps) {
  const { over, dropProps } = useDocDrop(null, tree.canManage);
  const count = unfiled.reduce((n, p) => n + countPages(p), 0);

  return (
    <li>
      <details open className="group/node">
        <summary
          className={`${ROW} cursor-pointer list-none [&::-webkit-details-marker]:hidden ${over ? DROP_OVER : ""}`}
          {...dropProps}
        >
          <ChevronRight className={TWISTY} strokeWidth={2} aria-hidden />
          <FolderClosed
            size={15}
            strokeWidth={1.75}
            className="shrink-0 text-ink-muted"
            aria-hidden
          />
          <span className="truncate font-medium text-ink-muted text-sm">Unfiled</span>
          <span className="ml-auto shrink-0 text-xs text-ink-muted tabular-nums">
            {count || "—"}
          </span>
        </summary>
        <ul className={`m-0 grid list-none gap-0.5 p-0 ${NEST}`}>
          {unfiled.map((p) => (
            <PageNode key={p.id} page={p} {...tree} />
          ))}
          {unfiled.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-ink-muted italic">
              Drop a page here to move it out of its folder
            </li>
          )}
        </ul>
      </details>
    </li>
  );
}

export function ExplorerTree({
  folders,
  unfiled,
  ...tree
}: { folders: ExplorerFolder[]; unfiled: ExplorerPage[] } & TreeProps) {
  // Managers always see "Unfiled" so there is a target to move a page out to top
  // level, even when nothing is currently unfiled.
  const showUnfiled = unfiled.length > 0 || tree.canManage;
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0">
      {folders.map((f) => (
        <FolderNode key={f.id} folder={f} {...tree} />
      ))}
      {showUnfiled && <UnfiledNode unfiled={unfiled} {...tree} />}
    </ul>
  );
}
