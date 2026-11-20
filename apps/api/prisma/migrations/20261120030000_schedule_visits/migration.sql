-- Schedule becomes core: the Care module is replaced by visits with tenant-defined visit types.
-- Shifts and care visits merge into one Visit (planned and actual times). Care status on clients goes away.
-- No real care data existed, so the old tables are dropped rather than copied.

DROP TABLE IF EXISTS "CareVisit";
DROP TABLE IF EXISTS "CareShift";
DROP TABLE IF EXISTS "CareShiftSeries";
DROP TYPE IF EXISTS "CareVisitStatus";
DROP TYPE IF EXISTS "CareShiftStatus";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "careStatus";
DROP TYPE IF EXISTS "CareStatus";

-- The Care module switch is gone (Schedule is on for every tenant).
UPDATE "Tenant" SET "modules" = array_remove("modules", 'care');
-- Any form still owned by the old Care module becomes an ordinary form.
UPDATE "Form" SET "module" = 'forms', "key" = NULL WHERE "module" = 'care';
-- The old single "visit checklist" form setting is replaced by forms attached to visit types.
UPDATE "Form" SET "settings" = "settings" - 'visitChecklist' WHERE "settings" ? 'visitChecklist';

CREATE TYPE "VisitStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

CREATE TABLE "VisitType" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VisitType_tenantId_nameKey_key" ON "VisitType"("tenantId", "nameKey");
CREATE INDEX "VisitType_tenantId_idx" ON "VisitType"("tenantId");
ALTER TABLE "VisitType" ADD CONSTRAINT "VisitType_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VisitTypeForm" (
  "tenantId" TEXT NOT NULL DEFAULT '',
  "visitTypeId" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitTypeForm_pkey" PRIMARY KEY ("visitTypeId", "formId")
);
CREATE INDEX "VisitTypeForm_formId_idx" ON "VisitTypeForm"("formId");
CREATE INDEX "VisitTypeForm_tenantId_idx" ON "VisitTypeForm"("tenantId");
ALTER TABLE "VisitTypeForm" ADD CONSTRAINT "VisitTypeForm_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitTypeForm" ADD CONSTRAINT "VisitTypeForm_visitTypeId_fkey"
  FOREIGN KEY ("visitTypeId") REFERENCES "VisitType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitTypeForm" ADD CONSTRAINT "VisitTypeForm_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VisitSeries" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT '',
  "clientId" TEXT NOT NULL,
  "userId" TEXT,
  "visitTypeId" TEXT NOT NULL,
  "weekdays" INTEGER[],
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT,
  "generatedUntil" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitSeries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VisitSeries_tenantId_idx" ON "VisitSeries"("tenantId");
ALTER TABLE "VisitSeries" ADD CONSTRAINT "VisitSeries_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VisitSeries" ADD CONSTRAINT "VisitSeries_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitSeries" ADD CONSTRAINT "VisitSeries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisitSeries" ADD CONSTRAINT "VisitSeries_visitTypeId_fkey"
  FOREIGN KEY ("visitTypeId") REFERENCES "VisitType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Visit" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT '',
  "clientId" TEXT NOT NULL,
  "userId" TEXT,
  "visitTypeId" TEXT NOT NULL,
  "seriesId" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "status" "VisitStatus" NOT NULL DEFAULT 'SCHEDULED',
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "notes" TEXT,
  "timeEntryId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Visit_timeEntryId_key" ON "Visit"("timeEntryId");
CREATE INDEX "Visit_tenantId_startAt_idx" ON "Visit"("tenantId", "startAt");
CREATE INDEX "Visit_userId_startAt_idx" ON "Visit"("userId", "startAt");
CREATE INDEX "Visit_clientId_startAt_idx" ON "Visit"("clientId", "startAt");
CREATE INDEX "Visit_seriesId_idx" ON "Visit"("seriesId");
CREATE INDEX "Visit_visitTypeId_idx" ON "Visit"("visitTypeId");
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_visitTypeId_fkey"
  FOREIGN KEY ("visitTypeId") REFERENCES "VisitType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_seriesId_fkey"
  FOREIGN KEY ("seriesId") REFERENCES "VisitSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_timeEntryId_fkey"
  FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FormResponse" ADD COLUMN "visitId" TEXT;
CREATE INDEX "FormResponse_visitId_idx" ON "FormResponse"("visitId");
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_visitId_fkey"
  FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
