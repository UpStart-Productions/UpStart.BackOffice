-- Old Network rolodex entries are "people I've talked to", not partners.
-- Tag every organization and person that came from Network with a CRM tag "Network", and take off
-- the Partner tag the fold (20261024020000) put on those organizations. Partner stays for real partners.
-- NetworkCompany / NetworkContact rows are still in place (unused) and identify what came from Network.

-- One "Network" tag per tenant that had Network data.
INSERT INTO "Tag" ("id", "tenantId", "name", "nameKey", "scope", "createdAt", "updatedAt")
SELECT DISTINCT 'crm-' || md5(t."tenantId" || '|network'), t."tenantId", 'Network', 'network', 'CRM'::"TagScope", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT "tenantId" FROM "NetworkCompany"
  UNION SELECT "tenantId" FROM "NetworkContact"
) t
ON CONFLICT ("tenantId", "scope", "nameKey") DO NOTHING;

-- Organizations that came from Network companies (same ids).
INSERT INTO "ClientTag" ("tenantId", "clientId", "tagId")
SELECT c."tenantId", c."id", tg."id"
FROM "NetworkCompany" nc
JOIN "Client" c ON c."id" = nc."id"
JOIN "Tag" tg ON tg."tenantId" = c."tenantId" AND tg."scope" = 'CRM' AND tg."nameKey" = 'network'
ON CONFLICT DO NOTHING;

-- People that came from Network contacts: same id, or merged into an existing person by email.
INSERT INTO "ContactTag" ("tenantId", "contactId", "tagId")
SELECT DISTINCT p."tenantId", p."id", tg."id"
FROM "NetworkContact" n
JOIN "Contact" p
  ON p."tenantId" = n."tenantId"
 AND (
   p."id" = n."id"
   OR p."id" IN (
     SELECT ce."contactId" FROM "ContactEmail" ce
     WHERE ce."tenantId" = n."tenantId" AND ce."email" = NULLIF(lower(btrim(n."email")), '')
   )
 )
JOIN "Tag" tg ON tg."tenantId" = p."tenantId" AND tg."scope" = 'CRM' AND tg."nameKey" = 'network'
ON CONFLICT DO NOTHING;

-- Network companies are not partners.
DELETE FROM "ClientTag" ct
USING "Tag" tg
WHERE ct."tagId" = tg."id" AND tg."scope" = 'CRM' AND tg."nameKey" = 'partner'
  AND ct."clientId" IN (SELECT "id" FROM "NetworkCompany");

-- Drop a Partner tag nothing uses any more (it is still offered as a suggestion).
DELETE FROM "Tag" tg
WHERE tg."scope" = 'CRM' AND tg."nameKey" = 'partner'
  AND NOT EXISTS (SELECT 1 FROM "ClientTag" x WHERE x."tagId" = tg."id")
  AND NOT EXISTS (SELECT 1 FROM "ContactTag" y WHERE y."tagId" = tg."id");
