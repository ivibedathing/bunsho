import { searchFolderOptions } from "@/lib/folders";
import { getCurrentUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Typeahead source for the folder picker. Same roles as the forms that carry the
// picker (DECISIONS.md — permission matrix): a viewer files nothing.
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role === "viewer") return new Response("Forbidden", { status: 403 });

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const folders = await searchFolderOptions(user.orgId, query);
  // `label` is the shape SearchSelect renders; the path is what it labels a folder by.
  return Response.json(folders.map((f) => ({ id: f.id, label: f.path })));
}
