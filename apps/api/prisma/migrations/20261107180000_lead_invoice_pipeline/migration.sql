-- Link pipeline cards to invoices (one active card per invoice per pipeline).

ALTER TABLE "Lead" ADD COLUMN "invoiceId" TEXT;

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Lead_invoiceId_idx" ON "Lead"("invoiceId");

CREATE UNIQUE INDEX "Lead_pipelineId_invoiceId_key" ON "Lead"("pipelineId", "invoiceId");
