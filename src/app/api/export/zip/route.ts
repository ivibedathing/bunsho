import { buildZip } from "@/lib/export/repo";
import { getCurrentUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Zip download of the current published Markdown set (DECISIONS.md). Managers only.
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user || user.role === "viewer") {
    return new Response("Forbidden", { status: 403 });
  }
  const zip = await buildZip(user.orgId);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="bunsho-export.zip"',
    },
  });
}
