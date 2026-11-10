-- Back Office guide: per-tenant switch to let it read records, and per-question usage log.
ALTER TABLE "OrganizationProfile" ADD COLUMN "guideReadsRecords" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "HelpAgentUsage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT '',
  "userId" TEXT,
  "model" TEXT NOT NULL,
  "readsRecords" BOOLEAN NOT NULL DEFAULT false,
  "toolCalls" JSONB NOT NULL DEFAULT '[]',
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HelpAgentUsage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HelpAgentUsage_tenantId_createdAt_idx" ON "HelpAgentUsage"("tenantId", "createdAt");
ALTER TABLE "HelpAgentUsage" ADD CONSTRAINT "HelpAgentUsage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HelpAgentUsage" ADD CONSTRAINT "HelpAgentUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
