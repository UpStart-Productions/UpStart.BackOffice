-- Pipeline cards linked to clients and projects (one active card per record per pipeline).

ALTER TABLE "Lead" ADD COLUMN "trackedClientId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "projectId" TEXT;

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_trackedClientId_fkey" FOREIGN KEY ("trackedClientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Lead_trackedClientId_idx" ON "Lead"("trackedClientId");
CREATE INDEX "Lead_projectId_idx" ON "Lead"("projectId");

CREATE UNIQUE INDEX "Lead_pipelineId_trackedClientId_key" ON "Lead"("pipelineId", "trackedClientId");
CREATE UNIQUE INDEX "Lead_pipelineId_projectId_key" ON "Lead"("pipelineId", "projectId");
