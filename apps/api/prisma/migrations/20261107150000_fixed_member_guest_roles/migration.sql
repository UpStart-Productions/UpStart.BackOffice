-- Fixed roles: every tenant has Admin (a user type), Member and Guest, and nothing else.
-- Member: staff, all of CRM plus assigned projects. Guest: only assigned projects and clients.
-- Access lives in libs/shared permissions.ts; the JSON written here matches it (the API re-syncs it anyway).
-- Users on any other role move to Member if that role could see CRM (Organizations, People, Activity,
-- Pipeline, Bookings or Forms at "all"), otherwise to Guest. The other roles are then removed.
-- Project roles become Lead (OWNER) or Member (EDITOR): commenters become members.

UPDATE "Role" SET "key" = 'member' WHERE "key" IS NULL AND lower("name") = 'member'
  AND NOT EXISTS (SELECT 1 FROM "Role" r2 WHERE r2."tenantId" = "Role"."tenantId" AND r2."key" = 'member');
UPDATE "Role" SET "key" = 'guest' WHERE "key" IS NULL AND lower("name") = 'guest'
  AND NOT EXISTS (SELECT 1 FROM "Role" r2 WHERE r2."tenantId" = "Role"."tenantId" AND r2."key" = 'guest');

-- Free the names for the built-in rows (a hand-made role called "Member" with another key, etc.).
UPDATE "Role" SET "name" = "name" || ' (old)' WHERE "key" IS DISTINCT FROM 'member' AND lower("name") = 'member';
UPDATE "Role" SET "name" = "name" || ' (old)' WHERE "key" IS DISTINCT FROM 'guest' AND lower("name") = 'guest';

INSERT INTO "Role" ("id", "tenantId", "name", "key", "permissions", "actions", "updatedAt")
SELECT 'member-' || t."id", t."id", 'Member', 'member', '{}'::jsonb, '{}'::jsonb, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."tenantId" = t."id" AND r."key" = 'member');

INSERT INTO "Role" ("id", "tenantId", "name", "key", "permissions", "actions", "updatedAt")
SELECT 'guest-' || t."id", t."id", 'Guest', 'guest', '{}'::jsonb, '{}'::jsonb, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."tenantId" = t."id" AND r."key" = 'guest');

UPDATE "Role" SET "name" = 'Member', "permissions" = '{"clients":"all","contacts":"all","pipeline":"all","bookings":"all","forms":"all","inbox":"all","care":"all","projects":"own","tasks":"own","time":"own","expenses":"own","invoices":"own","visits":"own","schedule":"own"}'::jsonb, "actions" = '{"clients":{"create":true,"edit":true,"delete":false},"contacts":{"create":true,"edit":true,"delete":false},"pipeline":{"create":true,"edit":true,"delete":false,"setup":false},"bookings":{"create":true,"edit":true,"delete":false,"setup":false},"forms":{"create":true,"edit":true,"delete":false},"inbox":{"create":true,"edit":true,"delete":false},"care":{"setup":false},"projects":{"create":true,"edit":true,"delete":false},"tasks":{"create":true,"edit":true,"delete":true},"time":{"create":true,"edit":true,"delete":true},"expenses":{"create":true,"edit":true,"delete":true},"invoices":{"create":true,"edit":true,"delete":true},"visits":{"create":true,"edit":true,"delete":true},"schedule":{"create":true,"edit":true,"delete":true}}'::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'member';
UPDATE "Role" SET "name" = 'Guest', "permissions" = '{"clients":"own","contacts":"own","care":"all","projects":"own","tasks":"own","time":"own","expenses":"own","invoices":"own","visits":"own","schedule":"own"}'::jsonb, "actions" = '{"clients":{"create":false,"edit":true,"delete":false},"contacts":{"create":false,"edit":true,"delete":false},"care":{"setup":false},"projects":{"create":false,"edit":true,"delete":false},"tasks":{"create":true,"edit":true,"delete":true},"time":{"create":true,"edit":true,"delete":true},"expenses":{"create":true,"edit":true,"delete":true},"invoices":{"create":true,"edit":true,"delete":true},"visits":{"create":true,"edit":true,"delete":true},"schedule":{"create":true,"edit":true,"delete":true}}'::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'guest';

-- Form access is keyed by role id: move each old role's grant to its new role (edit wins over read).
UPDATE "Form" f SET "access" = COALESCE((
  SELECT jsonb_object_agg(x.tid, x.lvl) FROM (
    SELECT t."id" AS tid, CASE WHEN bool_or(a.value = 'edit') THEN 'edit' ELSE 'read' END AS lvl
    FROM jsonb_each_text(f."access") a
    JOIN "Role" o ON o."id" = a.key
    JOIN "Role" t ON t."tenantId" = o."tenantId" AND t."key" = CASE
    WHEN o."key" IN ('member', 'guest') THEN o."key"
    WHEN EXISTS (
      SELECT 1 FROM jsonb_each_text(o."permissions") p
      WHERE p.key IN ('clients', 'contacts', 'inbox', 'pipeline', 'bookings', 'forms') AND p.value = 'all'
    ) THEN 'member'
    ELSE 'guest'
  END
    GROUP BY t."id"
  ) x
), '{}'::jsonb)
WHERE f."access" <> '{}'::jsonb;

UPDATE "User" u SET "roleId" = target."id"
FROM "Role" old, "Role" target
WHERE u."roleId" = old."id"
  AND (old."key" IS NULL OR old."key" NOT IN ('member', 'guest'))
  AND target."tenantId" = old."tenantId"
  AND target."key" = CASE
    WHEN EXISTS (
      SELECT 1 FROM jsonb_each_text(old."permissions") p
      WHERE p.key IN ('clients', 'contacts', 'inbox', 'pipeline', 'bookings', 'forms') AND p.value = 'all'
    ) THEN 'member'
    ELSE 'guest'
  END;

DELETE FROM "Role" WHERE "key" IS NULL OR "key" NOT IN ('member', 'guest');

UPDATE "ProjectMember" SET "role" = 'EDITOR' WHERE "role" = 'COMMENTER';
