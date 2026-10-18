-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('EMAIL', 'CALL', 'MEETING', 'NOTE');

-- CreateEnum
CREATE TYPE "InteractionDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "InteractionSource" AS ENUM ('FORWARD', 'BCC', 'CALENDAR', 'MANUAL');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('FILED', 'UNFILED');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('FROM', 'TO', 'CC', 'BCC', 'ATTENDEE');

-- AlterTable
ALTER TABLE "Artifact" ADD COLUMN     "interactionId" TEXT;

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoCreated" BOOLEAN NOT NULL DEFAULT false,
    "lastContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactEmail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactAccount" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "direction" "InteractionDirection" NOT NULL DEFAULT 'INBOUND',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT,
    "bodyHtmlKey" TEXT,
    "rawKey" TEXT,
    "messageId" TEXT,
    "threadKey" TEXT,
    "source" "InteractionSource" NOT NULL,
    "status" "InteractionStatus" NOT NULL DEFAULT 'UNFILED',
    "clientId" TEXT,
    "leadId" TEXT,
    "loggedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionParticipant" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "contactId" TEXT,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "ParticipantRole" NOT NULL,

    CONSTRAINT "InteractionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionCapture" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "userId" TEXT,
    "capturedByEmail" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForwardingVerification" (
    "id" TEXT NOT NULL,
    "aliasId" TEXT NOT NULL,
    "gmailAddress" TEXT,
    "code" TEXT,
    "link" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForwardingVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Contact_tenantId_lastName_firstName_idx" ON "Contact"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "ContactEmail_contactId_idx" ON "ContactEmail"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactEmail_tenantId_email_key" ON "ContactEmail"("tenantId", "email");

-- CreateIndex
CREATE INDEX "ContactAccount_clientId_idx" ON "ContactAccount"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactAccount_contactId_clientId_key" ON "ContactAccount"("contactId", "clientId");

-- CreateIndex
CREATE INDEX "Interaction_tenantId_clientId_occurredAt_idx" ON "Interaction"("tenantId", "clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_tenantId_status_occurredAt_idx" ON "Interaction"("tenantId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_tenantId_threadKey_idx" ON "Interaction"("tenantId", "threadKey");

-- CreateIndex
CREATE INDEX "Interaction_leadId_idx" ON "Interaction"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_tenantId_messageId_key" ON "Interaction"("tenantId", "messageId");

-- CreateIndex
CREATE INDEX "InteractionParticipant_interactionId_idx" ON "InteractionParticipant"("interactionId");

-- CreateIndex
CREATE INDEX "InteractionParticipant_contactId_idx" ON "InteractionParticipant"("contactId");

-- CreateIndex
CREATE INDEX "InteractionParticipant_email_idx" ON "InteractionParticipant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "InteractionCapture_interactionId_capturedByEmail_key" ON "InteractionCapture"("interactionId", "capturedByEmail");

-- CreateIndex
CREATE UNIQUE INDEX "InboundAlias_alias_key" ON "InboundAlias"("alias");

-- CreateIndex
CREATE INDEX "InboundAlias_tenantId_idx" ON "InboundAlias"("tenantId");

-- CreateIndex
CREATE INDEX "ForwardingVerification_aliasId_receivedAt_idx" ON "ForwardingVerification"("aliasId", "receivedAt");

-- CreateIndex
CREATE INDEX "Artifact_interactionId_idx" ON "Artifact"("interactionId");

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "Interaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEmail" ADD CONSTRAINT "ContactEmail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactEmail" ADD CONSTRAINT "ContactEmail_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAccount" ADD CONSTRAINT "ContactAccount_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAccount" ADD CONSTRAINT "ContactAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_loggedByUserId_fkey" FOREIGN KEY ("loggedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionParticipant" ADD CONSTRAINT "InteractionParticipant_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "Interaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionParticipant" ADD CONSTRAINT "InteractionParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionParticipant" ADD CONSTRAINT "InteractionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCapture" ADD CONSTRAINT "InteractionCapture_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "Interaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCapture" ADD CONSTRAINT "InteractionCapture_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundAlias" ADD CONSTRAINT "InboundAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardingVerification" ADD CONSTRAINT "ForwardingVerification_aliasId_fkey" FOREIGN KEY ("aliasId") REFERENCES "InboundAlias"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed the single default tenant (phase 1 stub; real multi-tenancy comes in phase 2).
INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
VALUES ('default', 'UpStart Productions', 'upstart', CURRENT_TIMESTAMP);
