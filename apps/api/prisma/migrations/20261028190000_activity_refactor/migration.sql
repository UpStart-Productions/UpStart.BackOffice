-- Next step on organizations (Activity refactor).
ALTER TABLE "Client" ADD COLUMN "nextAction" TEXT;
ALTER TABLE "Client" ADD COLUMN "nextActionDate" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "nextActionOwnerId" TEXT;
ALTER TABLE "Client" ADD CONSTRAINT "Client_nextActionOwnerId_fkey"
  FOREIGN KEY ("nextActionOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Activity → To do thresholds (per tenant).
ALTER TABLE "OrganizationProfile" ADD COLUMN "needsReplyDays" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "OrganizationProfile" ADD COLUMN "goneQuietDays" INTEGER NOT NULL DEFAULT 30;

-- Snoozed / dismissed To do rows. Own table so it can be dropped on its own.
CREATE TYPE "ActivityQueue" AS ENUM ('REPLY', 'NEXT_STEP', 'QUIET');
CREATE TABLE "ActivitySnooze" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT '',
  "queue" "ActivityQueue" NOT NULL,
  "refKey" TEXT NOT NULL,
  "until" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivitySnooze_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActivitySnooze_tenantId_queue_refKey_key" ON "ActivitySnooze"("tenantId", "queue", "refKey");
CREATE INDEX "ActivitySnooze_tenantId_idx" ON "ActivitySnooze"("tenantId");
ALTER TABLE "ActivitySnooze" ADD CONSTRAINT "ActivitySnooze_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivitySnooze" ADD CONSTRAINT "ActivitySnooze_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
