import { getAttachmentWithData, isInlineImageType } from "@/lib/attachments";
import { getCurrentUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** RFC 5987 fallback so quotes/unicode in a filename can't break the header. */
function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// Serve one attachment. Auth + org scope on every read; viewers may only reach
// attachments of current, published, non-retired documents (DECISIONS.md — roles;
// the same rule the document detail page applies).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachment = await getAttachmentWithData(user.orgId, id);
  if (!attachment) return new Response("Not found", { status: 404 });

  if (user.role === "viewer") {
    const doc = attachment.document;
    if (doc.retiredAt !== null || doc.currentPublishedVersionId === null) {
      return new Response("Not found", { status: 404 });
    }
  }

  // Only safe raster images render inline; everything else (including SVG and
  // HTML) is forced to download, and the CSP disarms anything that slips through.
  const inline = isInlineImageType(attachment.mimeType);
  return new Response(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": inline ? attachment.mimeType : "application/octet-stream",
      "Content-Disposition": contentDisposition(
        inline ? "inline" : "attachment",
        attachment.filename,
      ),
      "Content-Length": String(attachment.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
