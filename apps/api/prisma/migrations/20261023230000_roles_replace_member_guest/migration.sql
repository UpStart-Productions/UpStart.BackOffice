-- Two kinds of back-office user: ADMIN (everything) and USER (what their tenant Role grants).
-- MEMBER becomes USER. GUEST becomes USER on a built-in "Guest" role (Tasks: own = projects they are a member of).

-- Role.key marks built-in roles.
ALTER TABLE "Role" ADD COLUMN "key" TEXT;
CREATE UNIQUE INDEX "Role_tenantId_key_key" ON "Role"("tenantId", "key");

-- The role the previous migration created for existing users.
UPDATE "Role" SET "name" = 'Full access'
WHERE "name" = 'Staff'
  AND NOT EXISTS (SELECT 1 FROM "Role" r2 WHERE r2."tenantId" = "Role"."tenantId" AND r2."name" = 'Full access');

-- A Guest role per tenant (reuse one already named Guest).
UPDATE "Role" SET "key" = 'guest' WHERE "name" = 'Guest';
INSERT INTO "Role" ("id", "tenantId", "name", "key", "permissions", "updatedAt")
SELECT 'guest-' || t."id", t."id", 'Guest', 'guest', '{"tasks":"own"}'::jsonb, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."tenantId" = t."id" AND r."key" = 'guest');

UPDATE "User" u SET "roleId" = r."id"
FROM "Role" r
WHERE u."role" = 'GUEST' AND u."roleId" IS NULL AND r."tenantId" = u."tenantId" AND r."key" = 'guest';

-- UserRole: ADMIN, USER, CLIENT.
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'USER', 'CLIENT');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new"
  USING (CASE "role"::text WHEN 'MEMBER' THEN 'USER' WHEN 'GUEST' THEN 'USER' ELSE "role"::text END)::"UserRole_new";
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
