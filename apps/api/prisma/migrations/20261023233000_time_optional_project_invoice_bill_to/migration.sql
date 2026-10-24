-- Time entries: project optional, plus an optional client (the project's client, or picked directly).
ALTER TABLE "TimeEntry" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "TimeEntry" ADD COLUMN "clientId" TEXT;
CREATE INDEX "TimeEntry_clientId_idx" ON "TimeEntry"("clientId");
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "TimeEntry" te SET "clientId" = p."clientId" FROM "Project" p WHERE te."projectId" = p."id";

-- Invoices: billed to a client or to the tenant, with a bill-to snapshot.
CREATE TYPE "InvoiceBillTo" AS ENUM ('CLIENT', 'TENANT');
ALTER TABLE "Invoice" ADD COLUMN "billTo" "InvoiceBillTo" NOT NULL DEFAULT 'CLIENT';
ALTER TABLE "Invoice" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN "billToName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billToEmail" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billToAddress" TEXT;
UPDATE "Invoice" i SET
  "billToName" = c."name",
  "billToEmail" = NULLIF(TRIM(c."email"), ''),
  "billToAddress" = NULLIF(CONCAT_WS(E'\n',
    NULLIF(TRIM(c."address"), ''),
    NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(CONCAT_WS(', ', NULLIF(c."city", ''), NULLIF(c."state", ''))), ''), NULLIF(c."zip", ''))), '')
  ), '')
FROM "Client" c WHERE i."clientId" = c."id";

-- Tenant default bill-to email.
ALTER TABLE "OrganizationProfile" ADD COLUMN "billingEmail" TEXT;
