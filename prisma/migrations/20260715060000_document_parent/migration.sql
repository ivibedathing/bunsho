-- Pages can parent other pages, so the Explorer can show one hierarchy:
-- folders nest in folders, pages sit in folders, and pages nest under pages.

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "documents_parentId_idx" ON "documents"("parentId");

-- AddForeignKey
-- RESTRICT mirrors the folder tree: deleting a page that still has children is
-- refused rather than silently cascading a whole subtree away.
ALTER TABLE "documents" ADD CONSTRAINT "documents_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A nested page derives its location from its parent, so it carries no folder of
-- its own — the folder of record is its root ancestor's. Prisma's schema language
-- cannot express a CHECK, so the invariant is enforced here and documented on
-- Document.parentId. Existing rows all have parentId NULL, so this is satisfied.
ALTER TABLE "documents" ADD CONSTRAINT "documents_child_has_no_folder" CHECK ("parentId" IS NULL OR "folderId" IS NULL);
