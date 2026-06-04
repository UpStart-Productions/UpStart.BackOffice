-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW_LEAD', 'DISCOVERY', 'PROPOSAL_SENT', 'ACTIVE_CLIENT', 'PAST_CLIENT', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WARM_OUTREACH', 'REFERRAL', 'INBOUND', 'EVENT', 'SOCIAL', 'COLD_OUTREACH');

-- CreateEnum
CREATE TYPE "OrgCategory" AS ENUM ('RECOVERY', 'FAMILY', 'YOUTH', 'FAITH', 'HEALTH', 'DISABILITY', 'EDUCATION', 'JOBS_WORKFORCE', 'PETS', 'FUNDING', 'HUNGER', 'VIOLENCE', 'ACTIVITIES', 'OTHER');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('FILE', 'LINK', 'NOTE');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "category" "OrgCategory";

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "primaryContact" TEXT,
    "contactRole" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW_LEAD',
    "source" "LeadSource",
    "warmConnection" TEXT,
    "category" "OrgCategory",
    "serviceInterests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextAction" TEXT,
    "nextActionDate" TIMESTAMP(3),
    "lastContactDate" TIMESTAMP(3),
    "convertedClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "clientId" TEXT,
    "type" "ArtifactType" NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "url" TEXT,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedClientId_key" ON "Lead"("convertedClientId");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Artifact_leadId_idx" ON "Artifact"("leadId");

-- CreateIndex
CREATE INDEX "Artifact_clientId_idx" ON "Artifact"("clientId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedClientId_fkey" FOREIGN KEY ("convertedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
