-- Care: visit log checklist form kind, visits (tied to time entries) and the schedule (shifts, weekly series).
ALTER TYPE "CareFormKind" ADD VALUE 'VISIT';

CREATE TYPE "CareVisitStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
CREATE TYPE "CareShiftStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

CREATE TABLE "CareShiftSeries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
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
    CONSTRAINT "CareShiftSeries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "seriesId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "CareShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareVisit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shiftId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" "CareVisitStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "values" JSONB NOT NULL DEFAULT '{}',
    "timeEntryId" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareVisit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CareShiftSeries_tenantId_idx" ON "CareShiftSeries"("tenantId");
CREATE INDEX "CareShift_tenantId_startAt_idx" ON "CareShift"("tenantId", "startAt");
CREATE INDEX "CareShift_userId_startAt_idx" ON "CareShift"("userId", "startAt");
CREATE INDEX "CareShift_clientId_startAt_idx" ON "CareShift"("clientId", "startAt");
CREATE INDEX "CareShift_seriesId_idx" ON "CareShift"("seriesId");
CREATE UNIQUE INDEX "CareVisit_shiftId_key" ON "CareVisit"("shiftId");
CREATE UNIQUE INDEX "CareVisit_timeEntryId_key" ON "CareVisit"("timeEntryId");
CREATE INDEX "CareVisit_tenantId_startedAt_idx" ON "CareVisit"("tenantId", "startedAt");
CREATE INDEX "CareVisit_userId_startedAt_idx" ON "CareVisit"("userId", "startedAt");
CREATE INDEX "CareVisit_clientId_startedAt_idx" ON "CareVisit"("clientId", "startedAt");

ALTER TABLE "CareShiftSeries" ADD CONSTRAINT "CareShiftSeries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareShiftSeries" ADD CONSTRAINT "CareShiftSeries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareShiftSeries" ADD CONSTRAINT "CareShiftSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareShift" ADD CONSTRAINT "CareShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareShift" ADD CONSTRAINT "CareShift_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareShift" ADD CONSTRAINT "CareShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareShift" ADD CONSTRAINT "CareShift_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "CareShiftSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareVisit" ADD CONSTRAINT "CareVisit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareVisit" ADD CONSTRAINT "CareVisit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareVisit" ADD CONSTRAINT "CareVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareVisit" ADD CONSTRAINT "CareVisit_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CareShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareVisit" ADD CONSTRAINT "CareVisit_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
