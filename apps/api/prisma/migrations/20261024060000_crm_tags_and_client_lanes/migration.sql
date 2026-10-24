-- CRM restructure (2026-10-24):
-- 1. CRM tags for organizations and people, in the existing Tag table with a scope (TASK | CRM).
--    Organization "roles" (Partner, Vendor...) become CRM tags; the roles column is dropped.
-- 2. The pipeline holds opportunities only. The Active Client / Past Client lanes are removed:
--    their organizations get the matching status, their cards are archived, the lanes deleted.

-- CreateEnum
CREATE TYPE "TagScope" AS ENUM ('TASK', 'CRM');

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN "scope" "TagScope" NOT NULL DEFAULT 'TASK';
DROP INDEX "Tag_tenantId_nameKey_key";
CREATE UNIQUE INDEX "Tag_tenantId_scope_nameKey_key" ON "Tag"("tenantId", "scope", "nameKey");

-- CreateTable
CREATE TABLE "ClientTag" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("clientId", "tagId")
);
CREATE INDEX "ClientTag_tagId_idx" ON "ClientTag"("tagId");
CREATE INDEX "ClientTag_tenantId_idx" ON "ClientTag"("tenantId");
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ContactTag" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId", "tagId")
);
CREATE INDEX "ContactTag_tagId_idx" ON "ContactTag"("tagId");
CREATE INDEX "ContactTag_tenantId_idx" ON "ContactTag"("tenantId");
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Organization roles -> CRM tags (one tag per tenant per name, case-insensitive; first spelling wins).
CREATE TEMP TABLE "_role_tags" AS
SELECT DISTINCT c."tenantId" AS tenant_id, c."id" AS client_id,
       regexp_replace(btrim(r.role), '\s+', ' ', 'g') AS name,
       lower(regexp_replace(btrim(r.role), '\s+', ' ', 'g')) AS name_key
FROM "Client" c, unnest(c."roles") AS r(role)
WHERE btrim(r.role) <> '';

INSERT INTO "Tag" ("id", "tenantId", "name", "nameKey", "scope", "createdAt", "updatedAt")
SELECT 'crm-' || md5(tenant_id || '|' || name_key), tenant_id, min(name), name_key, 'CRM', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_role_tags"
GROUP BY tenant_id, name_key
ON CONFLICT DO NOTHING;

INSERT INTO "ClientTag" ("tenantId", "clientId", "tagId")
SELECT DISTINCT tenant_id, client_id, 'crm-' || md5(tenant_id || '|' || name_key)
FROM "_role_tags"
ON CONFLICT DO NOTHING;

DROP TABLE "_role_tags";

ALTER TABLE "Client" DROP COLUMN "roles";

-- Client lanes off the pipeline.
-- Organizations on cards in those lanes get the matching status (never downgrading an existing client).
UPDATE "Client" c SET "journey" = 'CLIENT'
WHERE c."journey" IN ('PROSPECT', 'NONE')
  AND EXISTS (
    SELECT 1 FROM "Lead" l JOIN "PipelineStage" s ON s."id" = l."stageId"
    WHERE s."legacyKey" = 'ACTIVE_CLIENT' AND COALESCE(l."clientId", l."convertedClientId") = c."id"
  );

UPDATE "Client" c SET "journey" = 'PAST_CLIENT'
WHERE c."journey" IN ('PROSPECT', 'NONE')
  AND EXISTS (
    SELECT 1 FROM "Lead" l JOIN "PipelineStage" s ON s."id" = l."stageId"
    WHERE s."legacyKey" = 'PAST_CLIENT' AND COALESCE(l."clientId", l."convertedClientId") = c."id"
  );

-- Their cards are archived and parked in the pipeline's first remaining lane (where Restore puts them).
UPDATE "Lead" l SET
  "archivedAt" = COALESCE(l."archivedAt", CURRENT_TIMESTAMP),
  "stageId" = f."id",
  "stage" = COALESCE(f."legacyKey", 'NEW_LEAD')
FROM "PipelineStage" s
LEFT JOIN LATERAL (
  SELECT x."id", x."legacyKey" FROM "PipelineStage" x
  WHERE x."pipelineId" = s."pipelineId"
    AND (x."legacyKey" IS NULL OR x."legacyKey" NOT IN ('ACTIVE_CLIENT', 'PAST_CLIENT'))
  ORDER BY x."sortOrder", x."createdAt"
  LIMIT 1
) f ON true
WHERE l."stageId" = s."id" AND s."legacyKey" IN ('ACTIVE_CLIENT', 'PAST_CLIENT');

UPDATE "BookingType" SET "leadStageId" = NULL
WHERE "leadStageId" IN (SELECT "id" FROM "PipelineStage" WHERE "legacyKey" IN ('ACTIVE_CLIENT', 'PAST_CLIENT'));

DELETE FROM "PipelineStage" WHERE "legacyKey" IN ('ACTIVE_CLIENT', 'PAST_CLIENT');
