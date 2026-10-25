ALTER TABLE "ProjectContact" ADD COLUMN "contactId" TEXT;

CREATE INDEX "ProjectContact_contactId_idx" ON "ProjectContact"("contactId");

ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
