-- Invoices billed to the tenant get their own links, so one time entry can be on a client invoice
-- and on the user's invoice to the tenant without either blocking the other.
ALTER TABLE "TimeEntry" ADD COLUMN "tenantInvoiceLineItemId" TEXT;
CREATE INDEX "TimeEntry_tenantInvoiceLineItemId_idx" ON "TimeEntry"("tenantInvoiceLineItemId");
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_tenantInvoiceLineItemId_fkey"
  FOREIGN KEY ("tenantInvoiceLineItemId") REFERENCES "InvoiceLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Time already on tenant invoices moves to the new link.
UPDATE "TimeEntry" te
SET "tenantInvoiceLineItemId" = te."invoiceLineItemId", "invoiceLineItemId" = NULL
FROM "InvoiceLineItem" li
JOIN "Invoice" i ON i."id" = li."invoiceId"
WHERE li."id" = te."invoiceLineItemId" AND i."billTo" = 'TENANT';

-- Reimbursable expenses on the user's invoice to the tenant; mileage.
ALTER TABLE "Expense" ADD COLUMN "miles" DECIMAL(10,2);
ALTER TABLE "Expense" ADD COLUMN "mileageRate" DECIMAL(10,4);
ALTER TABLE "Expense" ADD COLUMN "tenantInvoiceLineItemId" TEXT;
CREATE INDEX "Expense_tenantInvoiceLineItemId_idx" ON "Expense"("tenantInvoiceLineItemId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantInvoiceLineItemId_fkey"
  FOREIGN KEY ("tenantInvoiceLineItemId") REFERENCES "InvoiceLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganizationProfile" ADD COLUMN "mileageRate" DECIMAL(10,4);
