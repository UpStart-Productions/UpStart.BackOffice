-- Back Office guide (JD): saved conversations, private to each person, kept 30 days after last use.
CREATE TABLE "HelpAgentThread" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT '',
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "messages" JSONB NOT NULL DEFAULT '[]',
  "recordType" TEXT,
  "recordId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HelpAgentThread_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HelpAgentThread_tenantId_userId_updatedAt_idx" ON "HelpAgentThread"("tenantId", "userId", "updatedAt");
CREATE INDEX "HelpAgentThread_tenantId_userId_recordType_recordId_idx" ON "HelpAgentThread"("tenantId", "userId", "recordType", "recordId");
ALTER TABLE "HelpAgentThread" ADD CONSTRAINT "HelpAgentThread_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HelpAgentThread" ADD CONSTRAINT "HelpAgentThread_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
