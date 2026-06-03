-- Idempotent migration: remove workspace concept (safe if partially applied)

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkspaceRole') THEN
    ALTER TYPE "WorkspaceRole" RENAME TO "UserRole";
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'MEMBER';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hourlyRate" DECIMAL(10,2);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'WorkspaceUser') THEN
    UPDATE "User" u
    SET
      "role" = wu."role"::text::"UserRole",
      "hourlyRate" = COALESCE(u."hourlyRate", wu."hourlyRate")
    FROM "WorkspaceUser" wu
    WHERE u.id = wu."userId";
  END IF;
END $$;

-- Client
ALTER TABLE "Client" DROP CONSTRAINT IF EXISTS "Client_workspaceId_fkey";
DROP INDEX IF EXISTS "Client_workspaceId_idx";
DROP INDEX IF EXISTS "Client_workspaceId_code_key";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "workspaceId";
CREATE UNIQUE INDEX IF NOT EXISTS "Client_code_key" ON "Client"("code");

-- Project
ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_workspaceId_fkey";
DROP INDEX IF EXISTS "Project_workspaceId_idx";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "workspaceId";

-- TimeEntry
ALTER TABLE "TimeEntry" DROP CONSTRAINT IF EXISTS "TimeEntry_workspaceId_fkey";
DROP INDEX IF EXISTS "TimeEntry_workspaceId_idx";
ALTER TABLE "TimeEntry" DROP COLUMN IF EXISTS "workspaceId";

-- Invoice
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_workspaceId_fkey";
DROP INDEX IF EXISTS "Invoice_workspaceId_idx";
DROP INDEX IF EXISTS "Invoice_workspaceId_number_key";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "workspaceId";
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_number_key" ON "Invoice"("number");

DROP TABLE IF EXISTS "WorkspaceUser";
DROP TABLE IF EXISTS "Workspace";
