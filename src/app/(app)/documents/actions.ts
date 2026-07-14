"use server";

import path from "node:path";
import type { DocumentType } from "@/generated/prisma/client";
import { runAiReview, runAiSummary, runDocumentChecks } from "@/lib/checks";
import { prisma } from "@/lib/db";
import { isValidDocCode, normalizeDocCode } from "@/lib/docCode";
import { DOCUMENT_TYPES } from "@/lib/documentTypes";
import { createDocument, nextDocCode, saveDraft } from "@/lib/documents";
import { rebuildGitRepo } from "@/lib/export/repo";
import { createFolder } from "@/lib/folders";
import { importMarkdownFiles, importZip } from "@/lib/import";
import { getOrCreateDraft, publishDocument, restoreVersion, retireDocument } from "@/lib/lifecycle";
import { requireRole } from "@/lib/rbac";
import { acceptSuggestion, rejectSuggestion } from "@/lib/suggestions";
import { seedStarterTemplates } from "@/lib/templates";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const type = String(formData.get("type") ?? "other") as DocumentType;
  const folderRaw = String(formData.get("folderId") ?? "");
  const folderId = folderRaw === "" ? null : folderRaw;
  let docCode = normalizeDocCode(String(formData.get("docCode") ?? ""));

  if (!title) return { error: "Title is required." };
  if (!DOCUMENT_TYPES.includes(type)) return { error: "Choose a valid document type." };

  if (docCode === "") {
    docCode = await nextDocCode(user.orgId, type);
  } else if (!isValidDocCode(docCode)) {
    return { error: "Doc code must look like POL-007 (2–6 letters, hyphen, 3+ digits)." };
  } else {
    const clash = await prisma.document.findFirst({
      where: { orgId: user.orgId, docCode },
      select: { id: true },
    });
    if (clash) return { error: `Doc code ${docCode} is already in use.` };
  }

  const doc = await createDocument(user.orgId, user.id, { title, type, docCode, folderId });
  redirect(`/documents/${doc.id}/edit`);
}

export async function createFolderAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    await createFolder(user.orgId, name);
    revalidatePath("/documents");
  }
}

/** Autosave a draft from the editor. Bound arg (not a form) — RBAC + org scoped. */
export async function saveDraftAction(documentId: string, prosemirrorJson: unknown): Promise<void> {
  const user = await requireRole("admin", "editor");
  await saveDraft(user.orgId, documentId, prosemirrorJson);
}

export async function publishAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const documentId = String(formData.get("documentId") ?? "");
  const changeNote = String(formData.get("changeNote") ?? "");
  const published = await publishDocument(user.orgId, user.id, documentId, changeNote);
  revalidatePath(`/documents/${documentId}`);
  // The param triggers the one-time seal celebration on the detail page.
  redirect(`/documents/${documentId}?published=${published.version}`);
}

export async function editAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin", "editor");
  const documentId = String(formData.get("documentId") ?? "");
  await getOrCreateDraft(user.orgId, user.id, documentId);
  redirect(`/documents/${documentId}/edit`);
}

export async function retireAction(formData: FormData): Promise<void> {
  const user = await requireRole("admin"); // force-retire is Admin-only (PRD §6 matrix)
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
