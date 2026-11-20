-- Capture points: website forms, UBO forms and QR codes that add people to a pipeline lane (by id).
CREATE TABLE "CapturePoint" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL,
  "pipelineId" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "formId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "captureCount" INTEGER NOT NULL DEFAULT 0,
  "lastCapturedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapturePoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CapturePoint_formId_key" ON "CapturePoint"("formId");
CREATE INDEX "CapturePoint_tenantId_idx" ON "CapturePoint"("tenantId");
CREATE INDEX "CapturePoint_pipelineId_idx" ON "CapturePoint"("pipelineId");
CREATE INDEX "CapturePoint_stageId_idx" ON "CapturePoint"("stageId");
ALTER TABLE "CapturePoint" ADD CONSTRAINT "CapturePoint_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapturePoint" ADD CONSTRAINT "CapturePoint_pipelineId_fkey"
  FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapturePoint" ADD CONSTRAINT "CapturePoint_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CapturePoint" ADD CONSTRAINT "CapturePoint_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Which capture point brought a card in.
ALTER TABLE "Lead" ADD COLUMN "capturePointId" TEXT;
CREATE INDEX "Lead_capturePointId_idx" ON "Lead"("capturePointId");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_capturePointId_fkey"
  FOREIGN KEY ("capturePointId") REFERENCES "CapturePoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
