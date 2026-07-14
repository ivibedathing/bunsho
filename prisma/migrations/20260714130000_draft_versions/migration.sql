-- Drafts live in document_versions with publishedAt = NULL (mutable; the freeze
-- trigger only locks published rows). A draft has no frozen Markdown or SHA yet,
-- so those become nullable — set at publish (M3). `updatedAt` tracks autosaves.

-- AlterTable. The default backfills any existing rows, then is dropped so the
-- final column matches the Prisma `@updatedAt` model (app-maintained, no DB default).
ALTER TABLE "document_versions"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "markdown" DROP NOT NULL,
  ALTER COLUMN "contentSha" DROP NOT NULL;
ALTER TABLE "document_versions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Invariant: at most one open draft (publishedAt IS NULL) per document. Enforced
-- by trigger (consistent with the other audit invariants, and invisible to Prisma
-- drift detection unlike a partial unique index). App logic is the first gate;
-- this is the backstop.
CREATE OR REPLACE FUNCTION bunsho_one_draft_per_document() RETURNS trigger AS $$
BEGIN
  IF NEW."publishedAt" IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM "document_versions"
      WHERE "documentId" = NEW."documentId"
        AND "publishedAt" IS NULL
        AND "id" <> NEW."id"
    ) THEN
      RAISE EXCEPTION 'document % already has an open draft version', NEW."documentId"
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_versions_one_draft
  BEFORE INSERT OR UPDATE ON "document_versions"
  FOR EACH ROW EXECUTE FUNCTION bunsho_one_draft_per_document();
