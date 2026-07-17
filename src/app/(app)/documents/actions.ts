"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAttachment, deleteAttachment, isInlineImageType } from "@/lib/attachments";
import { runAiReview, runAiSummary, runDocumentChecks } from "@/lib/checks";
import { prisma } from "@/lib/db";
import { isValidDocCode, normalizeDocCode } from "@/lib/docCode";
import { createDocument, nextDocCode, saveDraft } from "@/lib/documents";
import { rebuildGitRepo } from "@/lib/export/repo";
import { createFolder, renameFolder } from "@/lib/folders";
import { importMarkdownFiles, importZip } from "@/lib/import";
import { getOrCreateDraft, publishDocument, restoreVersion, retireDocument } from "@/lib/lifecycle";
import { requireRole } from "@/lib/rbac";
import { acceptSuggestion, rejectSuggestion } from "@/lib/suggestions";
import { seedStarterTemplates } from "@/lib/templates";

const EXPORT_REPO_PATH =
  process.env.EXPORT_REPO_PATH ?? path.join(process.cwd(), ".data", "export-repo");

export interface NewDocState {
  error?: string;
}

export async function createDocumentAction(
  _prev: NewDocState,
  formData: FormData,
): Promise<NewDocState> {
  const user = await requireRole("admin", "editor");

  const title = String(formData.get("title") ?? "").trim();
  const folderRaw = String(formData.get("folderId") ?? "");
  const folderId = folderRaw === "" ? null : folderRaw;
  const parentRaw = String(formData.get("parentId") ?? "");
  const parentId = parentRaw === "" ? null : parentRaw;
  let docCode = normalizeDocCode(String(formData.get("docCode") ?? ""));

  if (!title) return { error: "Title is required." };

  if (docCode === "") {
    docCode = await nextDocCode(user.orgId);
  } else if (!isValidDocCode(docCode)) {
    return { error: "Doc code must look like DOC-007 (2–6 letters, hyphen, 3+ digits)." };
  } else {
    const clash = await prisma.document.findFirst({
      where: { orgId: user.orgId, docCode },
      select: { id: true },
    });
    if (clash) return { error: `Doc code ${docCode} is already in use.` };
  }

  if (parentId) {
    const parent = await prisma.document.findFirst({
      where: { id: parentId, orgId: user.orgId },
      select: { id: true },
    });
    if (!parent) return { error: "That parent page no longer exists." };
  }

  const doc = await createDocument(user.orgId, user.id, {
    title,
    docCode,
    folderId,
    parentId,
  });
  redirect(`/documents/${doc.id}/edit`);
}

/** Folder mutations are not audit-logged — folders are filing, not controlled content. */
export async function createFolderAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    await createFolder(user.orgId, name);
    revalidatePath("/documents");
    revalidatePath("/explorer");
  }
}

/** Rename from the Explorer tree. The redirect drops `?rename=` from the URL. */
export async function renameFolderAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const folderId = String(formData.get("folderId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (name && folderId) {
    await renameFolder(user.orgId, folderId, name);
    revalidatePath("/documents");
    revalidatePath("/explorer");
  }
  redirect("/explorer");
}

/**
 * Autosave a draft from the editor. Bound arg (not a form) — RBAC + org scoped.
 * The document travels as a JSON string: ProseMirror attrs objects have a null
 * prototype, and React serializes those into server-action arguments as opaque
 * temporary references — any node with attributes (headings, diagrams, images,
 * tables) would make the save throw.
 *
 * `getOrCreateDraft` first because `commitAction` closes the draft it publishes:
 * the next keystroke after an idle commit has nothing open to write to, and
 * `saveDraft` alone would throw.
 */
export async function saveDraftAction(documentId: string, prosemirrorJson: string): Promise<void> {
  const user = await requireRole("admin", "editor");
  await getOrCreateDraft(user.orgId, user.id, documentId);
  await saveDraft(user.orgId, documentId, JSON.parse(prosemirrorJson));
}

/**
 * Freeze the open draft as a version — the editor's idle commit (DECISIONS.md —
 * 2026-07-17, save-only pages). No form, no change note, no redirect: this fires
 * from a timer behind the user's back, so it must not navigate. A no-op when
 * nothing is open, which is the common case when the timer outlives the typing.
 */
export async function commitAction(documentId: string): Promise<void> {
  const user = await requireRole("admin", "editor");
  await publishDocument(user.orgId, user.id, documentId, undefined, { ifDraftOpen: true });
  revalidatePath(`/documents/${documentId}`);
}

export async function editAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const documentId = String(formData.get("documentId") ?? "");
  await getOrCreateDraft(user.orgId, user.id, documentId);
  redirect(`/documents/${documentId}/edit`);
}

export async function retireAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin"); // force-retire is Admin-only (DECISIONS.md — permission matrix)
  const documentId = String(formData.get("documentId") ?? "");
  await retireDocument(user.orgId, user.id, documentId);
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${documentId}`);
}

export async function restoreAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const documentId = String(formData.get("documentId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  await restoreVersion(user.orgId, user.id, documentId, versionId);
  redirect(`/documents/${documentId}/edit`);
}

// ── Attachments ──────────────────────────────────────────────────────────────

/** Upload one or more files as attachments of a document (panel form). */
export async function uploadAttachmentsAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const documentId = String(formData.get("documentId") ?? "");
  const uploads = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  for (const f of uploads) {
    await createAttachment(user.orgId, user.id, {
      documentId,
      filename: f.name,
      mimeType: f.type || "application/octet-stream",
      data: Buffer.from(await f.arrayBuffer()),
    });
  }
  revalidatePath(`/documents/${documentId}`);
}

export async function deleteAttachmentAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const documentId = String(formData.get("documentId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  await deleteAttachment(user.orgId, user.id, attachmentId);
  revalidatePath(`/documents/${documentId}`);
}

/**
 * Editor image upload (bound-arg action). Stores the image as a document
 * attachment and returns the URL the inline image node should reference.
 */
export async function uploadEditorImageAction(
  documentId: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const user = await requireRole("admin", "editor");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No file received." };
  if (!isInlineImageType(file.type)) {
    return { error: "Use a PNG, JPEG, GIF, or WebP image." };
  }
  try {
    const { id } = await createAttachment(user.orgId, user.id, {
      documentId,
      filename: file.name,
      mimeType: file.type,
      data: Buffer.from(await file.arrayBuffer()),
    });
    return { url: `/api/attachments/${id}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Upload failed." };
  }
}

// ── AI assistance (suggestion-only) ──────────────────────────────────────────

/** On-demand summary; returns the text for inline display (bound-arg action). */
export async function summarizeAction(documentId: string): Promise<string> {
  const user = await requireRole("admin", "editor");
  return runAiSummary(user.orgId, documentId);
}

export async function reviewAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const documentId = String(formData.get("documentId") ?? "");
  await runAiReview(user.orgId, documentId);
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${documentId}`);
}

/** On-demand deterministic checks for this document (runs inline). */
export async function runChecksAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const documentId = String(formData.get("documentId") ?? "");
  await runDocumentChecks(user.orgId, { documentId, origin: "on_demand" });
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${documentId}`);
}

export async function acceptSuggestionAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const documentId = String(formData.get("documentId") ?? "");
  const suggestionId = String(formData.get("suggestionId") ?? "");
  await acceptSuggestion(user.orgId, user.id, suggestionId);
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${documentId}`);
}

export async function rejectSuggestionAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const documentId = String(formData.get("documentId") ?? "");
  const suggestionId = String(formData.get("suggestionId") ?? "");
  await rejectSuggestion(user.orgId, user.id, suggestionId);
  revalidatePath(`/documents/${documentId}`);
  redirect(`/documents/${documentId}`);
}

// ── Export / import / templates (F9, F10, F11) ───────────────────────────────

/** Rebuild the one-way git export on the data volume (Admin-only). */
export async function exportGitAction(): Promise<void> {
  const user = await requireRole("admin");
  await rebuildGitRepo(user.orgId, EXPORT_REPO_PATH);
  redirect("/documents");
}

/** Import uploaded .md / .zip files into Draft documents. */
export async function importAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const uploads = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  const mdFiles: { name: string; content: string }[] = [];
  for (const f of uploads) {
    const name = f.name.toLowerCase();
    if (name.endsWith(".zip")) {
      await importZip(user.orgId, user.id, Buffer.from(await f.arrayBuffer()));
    } else if (name.endsWith(".md") || name.endsWith(".markdown")) {
      mdFiles.push({ name: f.name, content: await f.text() });
    }
  }
  if (mdFiles.length) await importMarkdownFiles(user.orgId, user.id, mdFiles);
  redirect("/documents");
}

/** Seed the SOC 2 starter template pack (Admin-only, idempotent). */
export async function loadTemplatesAction(): Promise<void> {
  const user = await requireRole("admin");
  await seedStarterTemplates(user.orgId, user.id);
  redirect("/documents");
}
