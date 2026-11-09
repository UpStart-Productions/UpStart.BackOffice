-- Allow dimensions on people and tasks (recordId is polymorphic; no FK to Client).
ALTER TYPE "DimensionEntity" ADD VALUE 'CONTACT';
ALTER TYPE "DimensionEntity" ADD VALUE 'TASK';

ALTER TABLE "DimensionValue" DROP CONSTRAINT IF EXISTS "DimensionValue_recordId_fkey";

-- CONTACT: tags dimension per tenant
INSERT INTO "DimensionDefinition" ("id", "tenantId", "entity", "key", "label", "sortOrder", "presets", "catalogExcluded", "searchInGlobal", "createdAt", "updatedAt")
SELECT
  'dd_' || t."id" || '_contact_tags',
  t."id",
  'CONTACT'::"DimensionEntity",
  'tags',
  'Tags',
  1,
  '["Network","Partner","Referral source","Vendor"]'::jsonb,
  ARRAY[]::TEXT[],
  true,
  NOW(),
  NOW()
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "DimensionDefinition" d
  WHERE d."tenantId" = t."id" AND d."entity" = 'CONTACT' AND d."key" = 'tags'
);

-- TASK: tags dimension per tenant
INSERT INTO "DimensionDefinition" ("id", "tenantId", "entity", "key", "label", "sortOrder", "presets", "catalogExcluded", "searchInGlobal", "createdAt", "updatedAt")
SELECT
  'dd_' || t."id" || '_task_tags',
  t."id",
  'TASK'::"DimensionEntity",
  'tags',
  'Tags',
  1,
  '[]'::jsonb,
  ARRAY[]::TEXT[],
  false,
  NOW(),
  NOW()
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "DimensionDefinition" d
  WHERE d."tenantId" = t."id" AND d."entity" = 'TASK' AND d."key" = 'tags'
);

-- Backfill people CRM tags into CONTACT dimensions
INSERT INTO "DimensionValue" ("id", "tenantId", "definitionId", "recordId", "values", "createdAt", "updatedAt")
SELECT
  'dv_' || ct."contactId" || '_contact_tags',
  ct."tenantId",
  'dd_' || ct."tenantId" || '_contact_tags',
  ct."contactId",
  ARRAY(
    SELECT DISTINCT t."name"
    FROM "ContactTag" cti
    INNER JOIN "Tag" t ON t."id" = cti."tagId"
    WHERE cti."contactId" = ct."contactId" AND t."scope" = 'CRM'
    ORDER BY t."name"
  ),
  NOW(),
  NOW()
FROM (SELECT DISTINCT "tenantId", "contactId" FROM "ContactTag") ct
ON CONFLICT ("definitionId", "recordId") DO UPDATE SET "values" = EXCLUDED."values", "updatedAt" = NOW();

-- Backfill task tags into TASK dimensions
INSERT INTO "DimensionValue" ("id", "tenantId", "definitionId", "recordId", "values", "createdAt", "updatedAt")
SELECT
  'dv_' || tt."taskId" || '_task_tags',
  tt."tenantId",
  'dd_' || tt."tenantId" || '_task_tags',
  tt."taskId",
  ARRAY(
    SELECT DISTINCT t."name"
    FROM "TaskTag" tti
    INNER JOIN "Tag" t ON t."id" = tti."tagId"
    WHERE tti."taskId" = tt."taskId" AND t."scope" = 'TASK'
    ORDER BY t."name"
  ),
  NOW(),
  NOW()
FROM (SELECT DISTINCT "tenantId", "taskId" FROM "TaskTag") tt
ON CONFLICT ("definitionId", "recordId") DO UPDATE SET "values" = EXCLUDED."values", "updatedAt" = NOW();

DROP TABLE IF EXISTS "ContactTag";
DROP TABLE IF EXISTS "TaskTag";
