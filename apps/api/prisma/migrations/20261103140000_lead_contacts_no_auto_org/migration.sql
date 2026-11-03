-- People linked to a pipeline card without requiring an organization record.
CREATE TABLE "LeadContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "leadId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadContact_leadId_contactId_key" ON "LeadContact"("leadId", "contactId");
CREATE INDEX "LeadContact_leadId_idx" ON "LeadContact"("leadId");
CREATE INDEX "LeadContact_contactId_idx" ON "LeadContact"("contactId");

ALTER TABLE "LeadContact" ADD CONSTRAINT "LeadContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadContact" ADD CONSTRAINT "LeadContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
