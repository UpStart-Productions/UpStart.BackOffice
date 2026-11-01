-- Care module: a client's care status (null = not in care).
-- CreateEnum
CREATE TYPE "CareStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "careStatus" "CareStatus";

-- Clients that already have an intake or care profile are in care.
UPDATE "Client" c SET "careStatus" = 'ACTIVE'
WHERE EXISTS (
  SELECT 1 FROM "FormResponse" r JOIN "Form" f ON f."id" = r."formId"
  WHERE r."clientId" = c."id" AND f."module" = 'care' AND f."key" IN ('INTAKE', 'CARE_PROFILE') AND r."status" = 'ACTIVE'
);
