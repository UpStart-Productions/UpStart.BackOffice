-- Lead category: preset enum values become plain text so tenants can add custom categories.
ALTER TABLE "Lead" ALTER COLUMN "category" TYPE TEXT USING "category"::TEXT;

ALTER TABLE "Lead" ADD COLUMN "warmConnectionContactId" TEXT;

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_warmConnectionContactId_fkey"
  FOREIGN KEY ("warmConnectionContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Lead_warmConnectionContactId_idx" ON "Lead"("warmConnectionContactId");
