-- Tenant-defined roles for staff users, and ClientAssignment (staff user <-> client). Also Invoice.createdById, so a role can be limited to its own invoices. Admins stay User.role = ADMIN (can do everything).
-- Each tenant gets a "Staff" role with every area at level "all", and today's staff (MEMBER) users are put on it,
-- so nothing changes for anyone until an admin edits it.

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAssignment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "roleId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ClientAssignment_tenantId_idx" ON "ClientAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "ClientAssignment_userId_idx" ON "ClientAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAssignment_clientId_userId_key" ON "ClientAssignment"("clientId", "userId");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "Invoice_createdById_idx" ON "Invoice"("createdById");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: a "Staff" role per tenant with every area, and existing staff users on it.
INSERT INTO "Role" ("id", "tenantId", "name", "permissions", "updatedAt")
SELECT 'staff-' || t."id", t."id", 'Staff',
       '{"clients":"all","contacts":"all","pipeline":"all","bookings":"all","network":"all","inbox":"all","projects":"all","tasks":"all","time":"all","expenses":"all","invoices":"all","reports":"all"}'::jsonb,
       CURRENT_TIMESTAMP
FROM "Tenant" t;

UPDATE "User" SET "roleId" = 'staff-' || "tenantId"
WHERE "role" = 'MEMBER' AND "tenantId" IS NOT NULL;
