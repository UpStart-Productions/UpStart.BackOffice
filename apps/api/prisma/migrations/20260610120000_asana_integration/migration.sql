-- CreateEnum
CREATE TYPE "ProjectTaskSource" AS ENUM ('MANUAL', 'ASANA');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "asanaProjectGid" TEXT,
ADD COLUMN "asanaProjectName" TEXT,
ADD COLUMN "asanaSectionGid" TEXT,
ADD COLUMN "asanaSectionName" TEXT;

-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN "source" "ProjectTaskSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "asanaTaskGid" TEXT;

-- DropIndex
DROP INDEX "ProjectTask_projectId_name_key";

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_source_idx" ON "ProjectTask"("projectId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTask_projectId_asanaTaskGid_key" ON "ProjectTask"("projectId", "asanaTaskGid");

-- CreateTable
CREATE TABLE "AsanaIntegration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "workspaceGid" TEXT,
    "workspaceName" TEXT,
    "connectedByEmail" TEXT,
    "pendingOAuthState" TEXT,
    "pendingOAuthStateExpiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsanaIntegration_pkey" PRIMARY KEY ("id")
);
