-- Bunsho invariants enforced at the database layer (DECISIONS.md).
--
-- Prisma's schema cannot express "immutable once published" or "append-only",
-- so the guarantees live here as triggers. They defend the audit story even
-- against direct SQL, not just the application code.

-- ── Write-once tables: reject every UPDATE and DELETE ─────────────────────────
-- audit_log is append-only; approvals / reviews / acknowledgments are write-once
-- evidence (dormant in v1, but the guarantee ships now).
CREATE OR REPLACE FUNCTION bunsho_reject_write() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Row is write-once: % on % is not permitted', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_write_once
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION bunsho_reject_write();

CREATE TRIGGER approvals_write_once
  BEFORE UPDATE OR DELETE ON "approvals"
  FOR EACH ROW EXECUTE FUNCTION bunsho_reject_write();

CREATE TRIGGER reviews_write_once
  BEFORE UPDATE OR DELETE ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION bunsho_reject_write();

CREATE TRIGGER acknowledgments_write_once
  BEFORE UPDATE OR DELETE ON "acknowledgments"
  FOR EACH ROW EXECUTE FUNCTION bunsho_reject_write();

-- ── Published versions are immutable content ─────────────────────────────────
-- Once "publishedAt" is set, the content and its identity are frozen. Only the
-- lifecycle timestamps "retiredAt" and "supersededAt" may still transition
-- (retire / supersede happen after publish). DELETE is intentionally NOT blocked
-- here: an Admin hard-deleting a document cascades to its versions, and the
-- deletion is itself recorded in the immutable audit_log.
CREATE OR REPLACE FUNCTION bunsho_freeze_published_version() RETURNS trigger AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL THEN
    IF NEW."id"              IS DISTINCT FROM OLD."id"
       OR NEW."orgId"        IS DISTINCT FROM OLD."orgId"
       OR NEW."documentId"   IS DISTINCT FROM OLD."documentId"
       OR NEW."version"      IS DISTINCT FROM OLD."version"
       OR NEW."prosemirrorJson" IS DISTINCT FROM OLD."prosemirrorJson"
       OR NEW."markdown"     IS DISTINCT FROM OLD."markdown"
       OR NEW."contentSha"   IS DISTINCT FROM OLD."contentSha"
       OR NEW."changeNote"   IS DISTINCT FROM OLD."changeNote"
       OR NEW."authorId"     IS DISTINCT FROM OLD."authorId"
       OR NEW."createdAt"    IS DISTINCT FROM OLD."createdAt"
       OR NEW."publishedAt"  IS DISTINCT FROM OLD."publishedAt"
    THEN
      RAISE EXCEPTION 'document_versions row % is published and immutable; only retiredAt/supersededAt may change', OLD."id"
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_versions_freeze_published
  BEFORE UPDATE ON "document_versions"
  FOR EACH ROW EXECUTE FUNCTION bunsho_freeze_published_version();
