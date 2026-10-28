ALTER TABLE "Project" ADD COLUMN "defaultExpenseReimbursable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "defaultExpenseBillable" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Project"
SET "defaultExpenseBillable" = true
WHERE "clientId" IS NOT NULL;
