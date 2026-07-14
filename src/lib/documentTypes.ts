import type { DocumentType } from "@/generated/prisma/client";

// Client-safe document-type metadata (no server imports — `import type` is erased),
// so both server code and client forms can share it.
export const DOCUMENT_TYPES: DocumentType[] = [
  "policy",
  "sop",
  "work_instruction",
  "standard",
  "other",
];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  policy: "Policy",
  sop: "SOP",
  work_instruction: "Work instruction",
  standard: "Standard",
  other: "Other",
};
