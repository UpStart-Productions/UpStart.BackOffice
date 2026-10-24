-- Tenant-defined relationship pipelines and lanes, plus manual archive for pipeline cards.
-- Every tenant gets one pipeline. The original tenant (id "default") keeps its six lanes exactly as they were
-- (same names, order and colors). Other tenants get four starter lanes, plus Active Client / Past Client
-- only if they already have leads there. The Lead.stage enum stays as a legacy mirror.

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "legacyKey" "LeadStage",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "pipelineId" TEXT, ADD COLUMN "stageId" TEXT, ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "BookingType" ADD COLUMN "leadStageId" TEXT;

-- Seed one pipeline per tenant.
INSERT INTO "Pipeline" ("id", "tenantId", "name", "sortOrder", "updatedAt")
SELECT 'pl-' || t."id", t."id", 'Pipeline', 0, CURRENT_TIMESTAMP FROM "Tenant" t;

-- Lanes. The original tenant keeps its board as it was.
WITH lanes(key, pos, upstart_name, starter_name, color) AS (
  VALUES
    ('NEW_LEAD',      0, '🌱 New Lead',      'New Lead',      'success'),
    ('DISCOVERY',     1, '🔍 Discovery',     'Discovery',     'info'),
    ('PROPOSAL_SENT', 2, '📄 Proposal Sent', 'Proposal Sent', 'warn'),
    ('ON_HOLD',       3, '❄️ On Hold',       'On Hold',       'secondary'),
    ('ACTIVE_CLIENT', 4, '🤝 Active Client', 'Active Client', 'success'),
    ('PAST_CLIENT',   5, '✅ Past Client',   'Past Client',   'secondary')
)
INSERT INTO "PipelineStage" ("id", "tenantId", "pipelineId", "name", "color", "sortOrder", "legacyKey", "updatedAt")
SELECT 'ps-' || t."id" || '-' || l.key, t."id", 'pl-' || t."id",
       CASE WHEN t."id" = 'default' THEN l.upstart_name ELSE l.starter_name END,
       l.color, l.pos, l.key::"LeadStage", CURRENT_TIMESTAMP
FROM "Tenant" t CROSS JOIN lanes l
WHERE t."id" = 'default'
   OR l.key IN ('NEW_LEAD', 'DISCOVERY', 'PROPOSAL_SENT', 'ON_HOLD')
   OR EXISTS (SELECT 1 FROM "Lead" x WHERE x."tenantId" = t."id" AND x."stage"::text = l.key);

-- Every lead goes to the lane matching its old stage.
UPDATE "Lead" SET "pipelineId" = 'pl-' || "tenantId", "stageId" = 'ps-' || "tenantId" || '-' || "stage"::text;

-- Booking types point at the lane matching their old stage, when the tenant has it.
UPDATE "BookingType" b SET "leadStageId" = s."id"
FROM "PipelineStage" s
WHERE s."id" = 'ps-' || b."tenantId" || '-' || b."leadStage"::text;

-- CreateIndex
CREATE INDEX "Pipeline_tenantId_sortOrder_idx" ON "Pipeline"("tenantId", "sortOrder");
CREATE INDEX "PipelineStage_pipelineId_sortOrder_idx" ON "PipelineStage"("pipelineId", "sortOrder");
CREATE INDEX "PipelineStage_tenantId_idx" ON "PipelineStage"("tenantId");
CREATE INDEX "Lead_pipelineId_stageId_idx" ON "Lead"("pipelineId", "stageId");

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingType" ADD CONSTRAINT "BookingType_leadStageId_fkey" FOREIGN KEY ("leadStageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
