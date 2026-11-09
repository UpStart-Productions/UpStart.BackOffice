-- CreateEnum
CREATE TYPE "DimensionEntity" AS ENUM ('CLIENT');

-- CreateTable
CREATE TABLE "DimensionDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "entity" "DimensionEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "presets" JSONB NOT NULL DEFAULT '[]',
    "searchInGlobal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DimensionDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DimensionValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "definitionId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DimensionValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DimensionDefinition_tenantId_entity_key_key" ON "DimensionDefinition"("tenantId", "entity", "key");
CREATE INDEX "DimensionDefinition_tenantId_entity_sortOrder_idx" ON "DimensionDefinition"("tenantId", "entity", "sortOrder");
CREATE UNIQUE INDEX "DimensionValue_definitionId_recordId_key" ON "DimensionValue"("definitionId", "recordId");
CREATE INDEX "DimensionValue_recordId_idx" ON "DimensionValue"("recordId");
CREATE INDEX "DimensionValue_tenantId_idx" ON "DimensionValue"("tenantId");

ALTER TABLE "DimensionDefinition" ADD CONSTRAINT "DimensionDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DimensionValue" ADD CONSTRAINT "DimensionValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DimensionValue" ADD CONSTRAINT "DimensionValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "DimensionDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DimensionValue" ADD CONSTRAINT "DimensionValue_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default CLIENT dimension definitions per tenant
INSERT INTO "DimensionDefinition" ("id", "tenantId", "entity", "key", "label", "sortOrder", "presets", "searchInGlobal", "createdAt", "updatedAt")
SELECT
  'dd_' || t."id" || '_tags',
  t."id",
  'CLIENT'::"DimensionEntity",
  'tags',
  'Tags',
  1,
  '["Network","Partner","Referral source","Vendor"]'::jsonb,
  true,
  NOW(),
  NOW()
FROM "Tenant" t
UNION ALL
SELECT 'dd_' || t."id" || '_services', t."id", 'CLIENT'::"DimensionEntity", 'services', 'Services', 2, '[]'::jsonb, true, NOW(), NOW() FROM "Tenant" t
UNION ALL
SELECT 'dd_' || t."id" || '_products', t."id", 'CLIENT'::"DimensionEntity", 'products', 'Products', 3, '[]'::jsonb, true, NOW(), NOW() FROM "Tenant" t
UNION ALL
SELECT 'dd_' || t."id" || '_focus', t."id", 'CLIENT'::"DimensionEntity", 'focus', 'Focus areas', 4,
  '["Recovery","Family","Youth","Faith","Health","Disability","Education","Jobs / Workforce","Pets","Funding","Hunger","Violence","Activities","Other"]'::jsonb,
  true, NOW(), NOW()
FROM "Tenant" t;

-- Backfill services
INSERT INTO "DimensionValue" ("id", "tenantId", "definitionId", "recordId", "values", "createdAt", "updatedAt")
SELECT
  'dv_' || c."id" || '_services',
  c."tenantId",
  'dd_' || c."tenantId" || '_services',
  c."id",
  c."services",
  NOW(),
  NOW()
FROM "Client" c
WHERE cardinality(c."services") > 0;

-- Backfill products
INSERT INTO "DimensionValue" ("id", "tenantId", "definitionId", "recordId", "values", "createdAt", "updatedAt")
SELECT
  'dv_' || c."id" || '_products',
  c."tenantId",
  'dd_' || c."tenantId" || '_products',
  c."id",
  c."products",
  NOW(),
  NOW()
FROM "Client" c
WHERE cardinality(c."products") > 0;

-- Backfill focus (enum to label)
INSERT INTO "DimensionValue" ("id", "tenantId", "definitionId", "recordId", "values", "createdAt", "updatedAt")
SELECT
  'dv_' || c."id" || '_focus',
  c."tenantId",
  'dd_' || c."tenantId" || '_focus',
  c."id",
  ARRAY(
    SELECT CASE fc::text
      WHEN 'RECOVERY' THEN 'Recovery'
      WHEN 'FAMILY' THEN 'Family'
      WHEN 'YOUTH' THEN 'Youth'
      WHEN 'FAITH' THEN 'Faith'
      WHEN 'HEALTH' THEN 'Health'
      WHEN 'DISABILITY' THEN 'Disability'
      WHEN 'EDUCATION' THEN 'Education'
      WHEN 'JOBS_WORKFORCE' THEN 'Jobs / Workforce'
      WHEN 'PETS' THEN 'Pets'
      WHEN 'FUNDING' THEN 'Funding'
      WHEN 'HUNGER' THEN 'Hunger'
      WHEN 'VIOLENCE' THEN 'Violence'
      WHEN 'ACTIVITIES' THEN 'Activities'
      ELSE 'Other'
    END
    FROM unnest(c."focusCategories") AS fc
  ),
  NOW(),
  NOW()
FROM "Client" c
WHERE cardinality(c."focusCategories") > 0;

-- Backfill organization CRM tags
INSERT INTO "DimensionValue" ("id", "tenantId", "definitionId", "recordId", "values", "createdAt", "updatedAt")
SELECT
  'dv_' || c."id" || '_tags',
  c."tenantId",
  'dd_' || c."tenantId" || '_tags',
  c."id",
  ARRAY(
    SELECT t."name" FROM "ClientTag" ct
    INNER JOIN "Tag" t ON t."id" = ct."tagId"
    WHERE ct."clientId" = c."id" AND t."scope" = 'CRM'
    ORDER BY t."name"
  ),
  NOW(),
  NOW()
FROM "Client" c
WHERE EXISTS (
  SELECT 1 FROM "ClientTag" ct
  INNER JOIN "Tag" t ON t."id" = ct."tagId"
  WHERE ct."clientId" = c."id" AND t."scope" = 'CRM'
);

DROP TABLE "ClientTag";

ALTER TABLE "Client" DROP COLUMN "services",
DROP COLUMN "products",
DROP COLUMN "focusCategories";
