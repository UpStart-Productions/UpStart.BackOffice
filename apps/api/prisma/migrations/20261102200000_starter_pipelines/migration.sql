-- Every tenant gets its pipeline at setup now (the app no longer creates one on first read).
-- Backfill tenants created since the pipelines migration that never opened their board.
INSERT INTO "Pipeline" ("id", "tenantId", "name", "sortOrder", "updatedAt")
SELECT 'pl-start-' || t."id", t."id", 'Pipeline', 0, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "Pipeline" p WHERE p."tenantId" = t."id");

WITH lanes(key, pos, name, color) AS (
  VALUES
    ('NEW_LEAD',      0, 'New Lead',      'success'),
    ('DISCOVERY',     1, 'Discovery',     'info'),
    ('PROPOSAL_SENT', 2, 'Proposal Sent', 'warn'),
    ('ON_HOLD',       3, 'On Hold',       'secondary')
)
INSERT INTO "PipelineStage" ("id", "tenantId", "pipelineId", "name", "color", "sortOrder", "legacyKey", "updatedAt")
SELECT 'ps-start-' || p."tenantId" || '-' || l.key, p."tenantId", p."id", l.name, l.color, l.pos, l.key::"LeadStage", CURRENT_TIMESTAMP
FROM "Pipeline" p CROSS JOIN lanes l
WHERE p."id" LIKE 'pl-start-%'
  AND NOT EXISTS (SELECT 1 FROM "PipelineStage" s WHERE s."pipelineId" = p."id");
