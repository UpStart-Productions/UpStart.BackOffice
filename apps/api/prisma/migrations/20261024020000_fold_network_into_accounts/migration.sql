-- Fold the Network rolodex into Accounts (Client) and Contacts.
-- Non-destructive: NetworkCompany / NetworkContact rows stay in place (unused) until a later cleanup migration.
-- Network companies keep their ids as Client ids; network contacts keep theirs as Contact ids unless the
-- same email already belongs to a Contact, in which case that Contact is linked instead.

-- AlterTable
ALTER TABLE "Client"
  ADD COLUMN "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "focusCategories" "OrgCategory"[] DEFAULT ARRAY[]::"OrgCategory"[],
  ADD COLUMN "isReferralReady" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isPublicFeatured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicSortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastContactAt" TIMESTAMP(3);

ALTER TABLE "Contact" ADD COLUMN "linkedInUrl" TEXT;

-- Companies -> Accounts (journey NONE, role Partner). Description is folded into the rich-text notes.
INSERT INTO "Client" (
  "id", "tenantId", "name", "website", "email", "phone", "notes", "isActive", "journey", "roles",
  "services", "products", "focusCategories", "isReferralReady", "isPublicFeatured", "publicSortOrder",
  "lastContactAt", "createdAt", "updatedAt"
)
SELECT
  nc."id", nc."tenantId", nc."name", nc."website", nc."email", nc."phone",
  NULLIF(
    concat_ws(
      E'\n',
      CASE WHEN nullif(btrim(nc."description"), '') IS NULL THEN NULL
           ELSE '<p>' || replace(replace(replace(nc."description", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>' END,
      nullif(btrim(nc."notes"), '')
    ),
    ''
  ),
  nc."isActive", 'NONE', ARRAY['Partner']::TEXT[],
  nc."services", nc."products", nc."focusCategories", nc."isReferralReady", nc."isPublicFeatured", nc."publicSortOrder",
  nc."lastContactDate", nc."createdAt", nc."updatedAt"
FROM "NetworkCompany" nc;

-- Contacts: map each network contact to the Contact that will represent it.
CREATE TEMP TABLE "_nc_map" AS
WITH base AS (
  SELECT n."id" AS net_id, n."tenantId" AS tenant_id, n."companyId" AS company_id,
         NULLIF(lower(btrim(n."email")), '') AS em, n."createdAt" AS created_at,
         ce."contactId" AS existing_contact_id
  FROM "NetworkContact" n
  LEFT JOIN "ContactEmail" ce
    ON ce."tenantId" = n."tenantId" AND ce."email" = NULLIF(lower(btrim(n."email")), '')
)
SELECT net_id, tenant_id, company_id, em,
       COALESCE(
         existing_contact_id,
         CASE WHEN em IS NULL THEN net_id
              ELSE first_value(net_id) OVER (PARTITION BY tenant_id, em ORDER BY created_at, net_id) END
       ) AS contact_id,
       (existing_contact_id IS NOT NULL) AS merged_existing
FROM base;

INSERT INTO "Contact" (
  "id", "tenantId", "firstName", "lastName", "title", "phone", "avatarUrl", "linkedInUrl",
  "isActive", "autoCreated", "lastContactAt", "createdAt", "updatedAt"
)
SELECT n."id", n."tenantId", n."firstName", n."lastName", n."title", n."phone", n."avatarUrl", n."linkedInUrl",
       true, false, n."lastContactDate", n."createdAt", n."updatedAt"
FROM "NetworkContact" n
JOIN "_nc_map" m ON m.net_id = n."id"
WHERE m.merged_existing = false AND m.contact_id = n."id";

INSERT INTO "ContactEmail" ("id", "tenantId", "contactId", "email", "isPrimary", "createdAt")
SELECT n."id" || '-email', n."tenantId", n."id", m.em, true, n."createdAt"
FROM "NetworkContact" n
JOIN "_nc_map" m ON m.net_id = n."id"
WHERE m.merged_existing = false AND m.contact_id = n."id" AND m.em IS NOT NULL
ON CONFLICT DO NOTHING;

-- Link every network contact (new or merged) to its company's Account, keeping title as the role.
INSERT INTO "ContactAccount" ("id", "tenantId", "contactId", "clientId", "role", "isPrimary", "createdAt")
SELECT 'na-' || n."id", n."tenantId", m.contact_id, n."companyId", n."title", n."isPrimary", n."createdAt"
FROM "NetworkContact" n
JOIN "_nc_map" m ON m.net_id = n."id"
ON CONFLICT DO NOTHING;

-- Artifacts: files, links and notes now also hang off the Account.
UPDATE "Artifact" SET "clientId" = "networkCompanyId"
WHERE "networkCompanyId" IS NOT NULL AND "clientId" IS NULL;

UPDATE "Artifact" a SET "clientId" = n."companyId"
FROM "NetworkContact" n
WHERE a."networkContactId" = n."id" AND a."clientId" IS NULL;

DROP TABLE "_nc_map";
