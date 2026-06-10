-- AlterTable
ALTER TABLE "AsanaIntegration" ADD COLUMN "clientId" TEXT,
ADD COLUMN "clientSecretEnc" TEXT,
ADD COLUMN "redirectUri" TEXT;
