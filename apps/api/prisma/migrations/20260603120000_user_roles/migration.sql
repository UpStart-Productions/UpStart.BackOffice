-- Consolidate isSuper into ADMIN role; add CLIENT role and optional client link.

ALTER TYPE "UserRole" ADD VALUE 'CLIENT';

UPDATE "User" SET "role" = 'ADMIN' WHERE "isSuper" = true;

ALTER TABLE "User" DROP COLUMN "isSuper";

ALTER TABLE "User" ADD COLUMN "clientId" TEXT;

ALTER TABLE "User"
  ADD CONSTRAINT "User_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
