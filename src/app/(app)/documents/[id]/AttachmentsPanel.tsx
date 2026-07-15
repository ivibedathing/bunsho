import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { AttachmentMeta } from "@/lib/attachments";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { deleteAttachmentAction, uploadAttachmentsAction } from "../actions";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Right-rail card listing a document's attachments; managers can upload/delete. */
export function AttachmentsPanel({
  documentId,
  attachments,
  canManage,
}: {
  documentId: string;
  attachments: AttachmentMeta[];
  canManage: boolean;
}) {
  return (
    <Card className="grid gap-3">
      <h2 className="m-0 flex items-center gap-2 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        <Paperclip size={13} strokeWidth={1.75} aria-hidden />
        Attachments
        {attachments.length > 0 && (
          <span className="rounded-full bg-gold-wash px-2 py-0.5 text-gold">
            {attachments.length}
          </span>
        )}
      </h2>

      {attachments.length === 0 ? (
        <p className="m-0 text-sm text-ink-muted">No files attached.</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <a
                  href={`/api/attachments/${a.id}`}
                  className="block truncate text-sm text-gold hover:underline"
                  title={a.filename}
                >
                  {a.filename}
                </a>
                <p className="m-0 text-xs text-ink-muted">
                  {fmtSize(a.size)}
                  {a.uploadedBy ? ` · ${a.uploadedBy.name ?? a.uploadedBy.email}` : ""}
                </p>
              </div>
              {canManage && (
                <form action={deleteAttachmentAction}>
                  <input type="hidden" name="documentId" value={documentId} />
                  <input type="hidden" name="attachmentId" value={a.id} />
                  <button
                    type="submit"
                    title={`Remove ${a.filename}`}
                    className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-control border-0 bg-transparent text-ink-muted transition-colors duration-150 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form action={uploadAttachmentsAction} className="grid gap-2 border-t border-line/60 pt-3">
          <input type="hidden" name="documentId" value={documentId} />
          <input
            name="files"
            type="file"
            multiple
            required
            className="text-xs text-ink-muted file:mr-2 file:cursor-pointer file:rounded-control file:border-0 file:bg-gold-wash file:px-2.5 file:py-1.5 file:text-xs file:text-gold"
          />
          <Button type="submit" variant="secondary" size="sm">
            <Upload size={14} strokeWidth={1.75} aria-hidden />
            Upload
          </Button>
        </form>
      )}
    </Card>
  );
}
