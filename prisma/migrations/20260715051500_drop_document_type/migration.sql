-- Documents no longer carry a type. The classification added friction at creation
-- time without earning its keep, and doc codes now use a single `DOC-` prefix
-- rather than deriving one per type (POL-/SOP-/WI-/STD-). Codes already assigned
-- keep their historical prefixes — they are plain strings and are not rewritten.

-- DropColumn
ALTER TABLE "documents" DROP COLUMN "type";

-- DropEnum
DROP TYPE "DocumentType";
