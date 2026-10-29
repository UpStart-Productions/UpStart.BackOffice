-- Billable expenses go on client invoices (at cost), linked like time entries, so the Expenses page can show billed / paid.
ALTER TABLE "Expense" ADD COLUMN "invoiceLineItemId" TEXT;
CREATE INDEX "Expense_invoiceLineItemId_idx" ON "Expense"("invoiceLineItemId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_invoiceLineItemId_fkey"
  FOREIGN KEY ("invoiceLineItemId") REFERENCES "InvoiceLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
