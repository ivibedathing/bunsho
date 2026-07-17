import { ChevronRight, FileText, FolderClosed, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { renameFolderAction } from "@/app/(app)/documents/actions";
import { Button } from "@/components/ui/Button";
import { DocCode } from "@/components/ui/DocCode";
import { Input } from "@/components/ui/Field";
import { StatusSeal } from "@/components/ui/StatusSeal";
import type { ExplorerFolder, ExplorerPage } from "@/lib/explorer";
import { countPages } from "@/lib/explorer";

/**
 * The hierarchy, rendered with <details>/<summary> so folders and pages collapse
 * without shipping any client JS. Everything below is a server component.
 *
 * Rename travels through the URL, the way the search filters do: the pencil links
 * to `?rename={id}`, and the folder it names swaps its row for an edit form. Which
 * is also why that one folder sheds its <details> wrapper — a form inside a
 * <summary> toggles the disclosure on every click into the input, and only client
 * JS could stop it.
 */

const ROW =
  "group flex items-center gap-2.5 rounded-control px-2 py-1.5 transition-colors hover:bg-gold-wash/40";
const TWISTY =
  "size-4 shrink-0 text-ink-muted transition-transform duration-150 group-open/node:rotate-90";
const NEST = "ml-[1.0625rem] border-l border-line/50 pl-3";
const ICON_ACTION =
  "shrink-0 rounded-control p-1 text-ink-muted no-underline opacity-0 transition-colors " +
  "hover:bg-gold-wash hover:text-gold focus-visible:opacity-100 group-hover:opacity-100";

interface TreeProps {
  /** Admins and Editors get the create and rename affordances; Viewers read only. */
  canManage: boolean;
  /** The folder being renamed, from `?rename=`. */
  renameId?: string;
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
  if (page.children.length === 0) {
    return (
      <li>
        <div className={ROW}>
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
        <summary className={`${ROW} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
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
        <summary className={`${ROW} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
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

export function ExplorerTree({
  folders,
  unfiled,
  ...tree
}: { folders: ExplorerFolder[]; unfiled: ExplorerPage[] } & TreeProps) {
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0">
      {folders.map((f) => (
        <FolderNode key={f.id} folder={f} {...tree} />
      ))}
      {unfiled.length > 0 && (
        <li>
          <details open className="group/node">
            <summary
              className={`${ROW} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
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
                {unfiled.reduce((n, p) => n + countPages(p), 0)}
              </span>
            </summary>
            <ul className={`m-0 grid list-none gap-0.5 p-0 ${NEST}`}>
              {unfiled.map((p) => (
                <PageNode key={p.id} page={p} {...tree} />
              ))}
            </ul>
          </details>
        </li>
      )}
    </ul>
  );
}
