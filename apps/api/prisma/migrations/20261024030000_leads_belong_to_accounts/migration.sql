-- Every pipeline item (Lead) belongs to an Account, and its person is a real Contact.
-- Non-destructive: the Lead text columns (primaryContact, email, phone, contactRole) stay as a legacy mirror.

ALTER TABLE "Lead" ADD COLUMN "clientId" TEXT, ADD COLUMN "primaryContactId" TEXT;

-- 1. Already-converted leads use the Client they became.
UPDATE "Lead" SET "clientId" = "convertedClientId" WHERE "convertedClientId" IS NOT NULL;

-- 2. Other leads: link to an existing Account with the same name (case-insensitive), else make a Prospect.
--    Several leads with the same new name share one Account.
CREATE TEMP TABLE "_lead_acct" AS
WITH todo AS (
  SELECT l."id" AS lead_id, l."tenantId" AS tenant_id, btrim(l."organization") AS org, l."createdAt" AS created_at
  FROM "Lead" l WHERE l."clientId" IS NULL
),
existing AS (
  SELECT DISTINCT ON (t.lead_id) t.lead_id, c."id" AS client_id
  FROM todo t
  JOIN "Client" c ON c."tenantId" = t.tenant_id AND lower(btrim(c."name")) = lower(t.org)
  ORDER BY t.lead_id, (c."journey" = 'CLIENT') DESC, c."createdAt"
)
SELECT t.lead_id, t.tenant_id, t.org,
       e.client_id AS existing_client_id,
       first_value(t.lead_id) OVER (PARTITION BY t.tenant_id, lower(t.org) ORDER BY t.created_at, t.lead_id) AS group_lead_id
FROM todo t LEFT JOIN existing e ON e.lead_id = t.lead_id;

-- New Prospect Accounts take the id of the first lead in each name group.
INSERT INTO "Client" (
  "id", "tenantId", "name", "email", "phone", "website", "category", "journey", "isActive",
  "lastContactAt", "createdAt", "updatedAt"
)
SELECT l."id", l."tenantId", a.org, l."email", l."phone", l."website", l."category",
       CASE l."stage" WHEN 'ACTIVE_CLIENT' THEN 'CLIENT' WHEN 'PAST_CLIENT' THEN 'PAST_CLIENT' ELSE 'PROSPECT' END::"AccountJourney",
       true, l."lastContactDate", l."createdAt", l."updatedAt"
FROM "_lead_acct" a
JOIN "Lead" l ON l."id" = a.lead_id
WHERE a.existing_client_id IS NULL AND a.group_lead_id = a.lead_id;

UPDATE "Lead" l SET "clientId" = COALESCE(a.existing_client_id, a.group_lead_id)
FROM "_lead_acct" a WHERE a.lead_id = l."id";

-- 3. The lead's person becomes a Contact (matched by email first), linked to the Account.
CREATE TEMP TABLE "_lead_person" AS
WITH base AS (
  SELECT l."id" AS lead_id, l."tenantId" AS tenant_id, l."clientId" AS client_id,
         NULLIF(btrim(l."primaryContact"), '') AS person,
         NULLIF(lower(btrim(l."email")), '') AS em,
         l."createdAt" AS created_at,
         ce."contactId" AS existing_contact_id
  FROM "Lead" l
  LEFT JOIN "ContactEmail" ce
    ON ce."tenantId" = l."tenantId" AND ce."email" = NULLIF(lower(btrim(l."email")), '')
  WHERE NULLIF(btrim(l."primaryContact"), '') IS NOT NULL OR NULLIF(btrim(l."email"), '') IS NOT NULL
)
SELECT lead_id, tenant_id, client_id, person, em, existing_contact_id,
       COALESCE(
         existing_contact_id,
         CASE WHEN em IS NULL THEN lead_id
              ELSE first_value(lead_id) OVER (PARTITION BY tenant_id, em ORDER BY created_at, lead_id) END
       ) AS contact_id
FROM base;

INSERT INTO "Contact" ("id", "tenantId", "firstName", "lastName", "phone", "isActive", "autoCreated", "lastContactAt", "createdAt", "updatedAt")
SELECT p.lead_id, p.tenant_id,
       COALESCE(
         NULLIF(split_part(p.person, ' ', 1), ''),
         split_part(p.em, '@', 1)
       ),
       NULLIF(btrim(substr(p.person, length(split_part(p.person, ' ', 1)) + 1)), ''),
       NULLIF(btrim(l."phone"), ''), true, false, l."lastContactDate", l."createdAt", l."updatedAt"
FROM "_lead_person" p JOIN "Lead" l ON l."id" = p.lead_id
WHERE p.existing_contact_id IS NULL AND p.contact_id = p.lead_id;

INSERT INTO "ContactEmail" ("id", "tenantId", "contactId", "email", "isPrimary", "createdAt")
SELECT p.lead_id || '-email', p.tenant_id, p.lead_id, p.em, true, l."createdAt"
FROM "_lead_person" p JOIN "Lead" l ON l."id" = p.lead_id
WHERE p.existing_contact_id IS NULL AND p.contact_id = p.lead_id AND p.em IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "ContactAccount" ("id", "tenantId", "contactId", "clientId", "role", "isPrimary", "createdAt")
SELECT 'la-' || p.lead_id, p.tenant_id, p.contact_id, p.client_id, NULLIF(btrim(l."contactRole"), ''), true, l."createdAt"
FROM "_lead_person" p JOIN "Lead" l ON l."id" = p.lead_id
ON CONFLICT DO NOTHING;

UPDATE "Lead" l SET "primaryContactId" = p.contact_id FROM "_lead_person" p WHERE p.lead_id = l."id";

-- 4. Communications already filed to a lead also belong to its Account.
UPDATE "Interaction" i SET "clientId" = l."clientId"
FROM "Lead" l WHERE i."leadId" = l."id" AND i."clientId" IS NULL AND l."clientId" IS NOT NULL;

-- AddForeignKey / indexes
CREATE INDEX "Lead_clientId_idx" ON "Lead"("clientId");
CREATE INDEX "Lead_primaryContactId_idx" ON "Lead"("primaryContactId");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "_lead_acct";
DROP TABLE "_lead_person";
