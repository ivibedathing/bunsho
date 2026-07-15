import { ChevronRight, FileText, FolderClosed, Plus } from "lucide-react";
import Link from "next/link";
import { DocCode } from "@/components/ui/DocCode";
import { StatusSeal } from "@/components/ui/StatusSeal";
import type { ExplorerFolder, ExplorerPage } from "@/lib/explorer";
import { countPages } from "@/lib/explorer";

/**
 * The hierarchy, rendered with <details>/<summary> so folders and pages collapse
 * without shipping any client JS. Everything below is a server component.
 */

const ROW =
  "group flex items-center gap-2.5 rounded-control px-2 py-1.5 transition-colors hover:bg-gold-wash/40";
const TWISTY =
  "size-4 shrink-0 text-ink-muted transition-transform duration-150 group-open/node:rotate-90";
const NEST = "ml-[1.0625rem] border-l border-line/50 pl-3";

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
      className="ml-auto shrink-0 rounded-control p-1 text-ink-muted no-underline opacity-0 transition-colors hover:bg-gold-wash hover:text-gold focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Plus size={14} strokeWidth={2} aria-hidden />
    </Link>
  );
}

function PageRow({ page, canCreate }: { page: ExplorerPage; canCreate: boolean }) {
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
      <StatusSeal status={page.status} />
      {canCreate && <SubpageLink id={page.id} label={`New subpage under ${page.title}`} />}
    </>
  );
}

function PageNode({ page, canCreate }: { page: ExplorerPage; canCreate: boolean }) {
  if (page.children.length === 0) {
    return (
      <li>
        <div className={ROW}>
          <TwistySpacer />
          <PageRow page={page} canCreate={canCreate} />
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
          <PageRow page={page} canCreate={canCreate} />
          <span className="shrink-0 text-xs text-ink-muted tabular-nums">
            {total} {total === 1 ? "subpage" : "subpages"}
          </span>
        </summary>
        <ul className={`m-0 grid list-none gap-0.5 p-0 ${NEST}`}>
          {page.children.map((c) => (
            <PageNode key={c.id} page={c} canCreate={canCreate} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function FolderNode({ folder, canCreate }: { folder: ExplorerFolder; canCreate: boolean }) {
  const pages = folder.pages.reduce((n, p) => n + countPages(p), 0);
  const isEmpty = folder.pages.length === 0 && folder.folders.length === 0;

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
        </summary>
        <ul className={`m-0 grid list-none gap-0.5 p-0 ${NEST}`}>
          {folder.folders.map((f) => (
            <FolderNode key={f.id} folder={f} canCreate={canCreate} />
          ))}
          {folder.pages.map((p) => (
            <PageNode key={p.id} page={p} canCreate={canCreate} />
          ))}
          {isEmpty && <li className="px-2 py-1.5 text-sm text-ink-muted italic">Empty folder</li>}
        </ul>
      </details>
    </li>
  );
}

export function ExplorerTree({
  folders,
  unfiled,
  canCreate,
}: {
  folders: ExplorerFolder[];
  unfiled: ExplorerPage[];
  canCreate: boolean;
}) {
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0">
      {folders.map((f) => (
        <FolderNode key={f.id} folder={f} canCreate={canCreate} />
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
                <PageNode key={p.id} page={p} canCreate={canCreate} />
              ))}
            </ul>
          </details>
        </li>
      )}
    </ul>
  );
}
