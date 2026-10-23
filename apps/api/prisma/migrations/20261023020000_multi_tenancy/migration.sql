-- Multi-tenancy: tenantId on every table, per-tenant uniqueness, per-tenant singletons.
-- Regular users belong to one tenant (User.tenantId); User.isSuper marks the platform operator.
-- Column default '' is deliberate: the API injects the real tenant, and a missed injection
-- fails the foreign key instead of silently landing in another tenant.

-- DropIndex
DROP INDEX "Client_code_key";

-- DropIndex
DROP INDEX "Invoice_number_key";

-- DropIndex
DROP INDEX "Account_code_key";

-- DropIndex
DROP INDEX "BankTransaction_externalId_key";

-- DropIndex
DROP INDEX "CategorizationRule_matchKey_key";

-- DropIndex
DROP INDEX "Tag_nameKey_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSuper" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "NetworkCompany" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "NetworkContact" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Artifact" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ProjectContact" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "AsanaIntegration" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "GoogleCalendarIntegration" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "OrganizationProfile" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Payable" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ServiceKey" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "InvoiceLineItem" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "BookingType" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "BookingAvailabilityRule" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "CategorizationRule" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ProjectStar" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TaskSection" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TaskProjectLink" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TaskTag" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TaskFollower" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TaskAttachment" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TaskCustomField" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TaskCustomFieldValue" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "UserNotification" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "UserNotificationPreference" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "UserInvite" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TaskForm" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Contact" ALTER COLUMN "tenantId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ContactEmail" ALTER COLUMN "tenantId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ContactAccount" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Interaction" ALTER COLUMN "tenantId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "InteractionParticipant" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "InteractionCapture" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "InboundAlias" ALTER COLUMN "tenantId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "ForwardingVerification" ADD COLUMN     "tenantId" TEXT NOT NULL DEFAULT '';

-- Backfill: every existing row belongs to the default tenant (UpStart).
-- The default tenant is seeded by 20261017220000_crm_communications; this is a safety net.
INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
VALUES ('default', 'UpStart Productions', 'upstart', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "User" SET "tenantId" = 'default';
UPDATE "Client" SET "tenantId" = 'default';
UPDATE "Lead" SET "tenantId" = 'default';
UPDATE "NetworkCompany" SET "tenantId" = 'default';
UPDATE "NetworkContact" SET "tenantId" = 'default';
UPDATE "Artifact" SET "tenantId" = 'default';
UPDATE "Project" SET "tenantId" = 'default';
UPDATE "ProjectContact" SET "tenantId" = 'default';
UPDATE "ProjectTask" SET "tenantId" = 'default';
UPDATE "AsanaIntegration" SET "tenantId" = 'default';
UPDATE "GoogleCalendarIntegration" SET "tenantId" = 'default';
UPDATE "OrganizationProfile" SET "tenantId" = 'default';
UPDATE "TimeEntry" SET "tenantId" = 'default';
UPDATE "Expense" SET "tenantId" = 'default';
UPDATE "Invoice" SET "tenantId" = 'default';
UPDATE "Payable" SET "tenantId" = 'default';
UPDATE "ServiceKey" SET "tenantId" = 'default';
UPDATE "InvoiceLineItem" SET "tenantId" = 'default';
UPDATE "BookingType" SET "tenantId" = 'default';
UPDATE "BookingAvailabilityRule" SET "tenantId" = 'default';
UPDATE "Booking" SET "tenantId" = 'default';
UPDATE "Account" SET "tenantId" = 'default';
UPDATE "JournalEntry" SET "tenantId" = 'default';
UPDATE "JournalLine" SET "tenantId" = 'default';
UPDATE "BankTransaction" SET "tenantId" = 'default';
UPDATE "CategorizationRule" SET "tenantId" = 'default';
UPDATE "ProjectMember" SET "tenantId" = 'default';
UPDATE "ProjectStar" SET "tenantId" = 'default';
UPDATE "TaskSection" SET "tenantId" = 'default';
UPDATE "TaskProjectLink" SET "tenantId" = 'default';
UPDATE "Tag" SET "tenantId" = 'default';
UPDATE "TaskTag" SET "tenantId" = 'default';
UPDATE "Task" SET "tenantId" = 'default';
UPDATE "TaskFollower" SET "tenantId" = 'default';
UPDATE "TaskComment" SET "tenantId" = 'default';
UPDATE "TaskAttachment" SET "tenantId" = 'default';
UPDATE "TaskCustomField" SET "tenantId" = 'default';
UPDATE "TaskCustomFieldValue" SET "tenantId" = 'default';
UPDATE "UserNotification" SET "tenantId" = 'default';
UPDATE "UserNotificationPreference" SET "tenantId" = 'default';
UPDATE "UserInvite" SET "tenantId" = 'default';
UPDATE "TaskForm" SET "tenantId" = 'default';
UPDATE "ContactAccount" SET "tenantId" = 'default';
UPDATE "InteractionParticipant" SET "tenantId" = 'default';
UPDATE "InteractionCapture" SET "tenantId" = 'default';
UPDATE "ForwardingVerification" SET "tenantId" = 'default';

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_code_key" ON "Client"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

-- CreateIndex
CREATE INDEX "NetworkCompany_tenantId_idx" ON "NetworkCompany"("tenantId");

-- CreateIndex
CREATE INDEX "NetworkContact_tenantId_idx" ON "NetworkContact"("tenantId");

-- CreateIndex
CREATE INDEX "Artifact_tenantId_idx" ON "Artifact"("tenantId");

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");

-- CreateIndex
CREATE INDEX "ProjectContact_tenantId_idx" ON "ProjectContact"("tenantId");

-- CreateIndex
CREATE INDEX "ProjectTask_tenantId_idx" ON "ProjectTask"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AsanaIntegration_tenantId_key" ON "AsanaIntegration"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarIntegration_tenantId_key" ON "GoogleCalendarIntegration"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationProfile_tenantId_key" ON "OrganizationProfile"("tenantId");

-- CreateIndex
CREATE INDEX "TimeEntry_tenantId_idx" ON "TimeEntry"("tenantId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_idx" ON "Expense"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_number_key" ON "Invoice"("tenantId", "number");

-- CreateIndex
CREATE INDEX "Payable_tenantId_idx" ON "Payable"("tenantId");

-- CreateIndex
CREATE INDEX "ServiceKey_tenantId_idx" ON "ServiceKey"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_tenantId_idx" ON "InvoiceLineItem"("tenantId");

-- CreateIndex
CREATE INDEX "BookingType_tenantId_idx" ON "BookingType"("tenantId");

-- CreateIndex
CREATE INDEX "BookingAvailabilityRule_tenantId_idx" ON "BookingAvailabilityRule"("tenantId");

-- CreateIndex
CREATE INDEX "Booking_tenantId_idx" ON "Booking"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_tenantId_code_key" ON "Account"("tenantId", "code");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_idx" ON "JournalEntry"("tenantId");

-- CreateIndex
CREATE INDEX "JournalLine_tenantId_idx" ON "JournalLine"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_tenantId_externalId_key" ON "BankTransaction"("tenantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CategorizationRule_tenantId_matchKey_key" ON "CategorizationRule"("tenantId", "matchKey");

-- CreateIndex
CREATE INDEX "ProjectMember_tenantId_idx" ON "ProjectMember"("tenantId");

-- CreateIndex
CREATE INDEX "ProjectStar_tenantId_idx" ON "ProjectStar"("tenantId");

-- CreateIndex
CREATE INDEX "TaskSection_tenantId_idx" ON "TaskSection"("tenantId");

-- CreateIndex
CREATE INDEX "TaskProjectLink_tenantId_idx" ON "TaskProjectLink"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_nameKey_key" ON "Tag"("tenantId", "nameKey");

-- CreateIndex
CREATE INDEX "TaskTag_tenantId_idx" ON "TaskTag"("tenantId");

-- CreateIndex
CREATE INDEX "Task_tenantId_idx" ON "Task"("tenantId");

-- CreateIndex
CREATE INDEX "TaskFollower_tenantId_idx" ON "TaskFollower"("tenantId");

-- CreateIndex
CREATE INDEX "TaskComment_tenantId_idx" ON "TaskComment"("tenantId");

-- CreateIndex
CREATE INDEX "TaskAttachment_tenantId_idx" ON "TaskAttachment"("tenantId");

-- CreateIndex
CREATE INDEX "TaskCustomField_tenantId_idx" ON "TaskCustomField"("tenantId");

-- CreateIndex
CREATE INDEX "TaskCustomFieldValue_tenantId_idx" ON "TaskCustomFieldValue"("tenantId");

-- CreateIndex
CREATE INDEX "UserNotification_tenantId_idx" ON "UserNotification"("tenantId");

-- CreateIndex
CREATE INDEX "UserNotificationPreference_tenantId_idx" ON "UserNotificationPreference"("tenantId");

-- CreateIndex
CREATE INDEX "UserInvite_tenantId_idx" ON "UserInvite"("tenantId");

-- CreateIndex
CREATE INDEX "TaskForm_tenantId_idx" ON "TaskForm"("tenantId");

-- CreateIndex
CREATE INDEX "ContactAccount_tenantId_idx" ON "ContactAccount"("tenantId");

-- CreateIndex
CREATE INDEX "InteractionParticipant_tenantId_idx" ON "InteractionParticipant"("tenantId");

-- CreateIndex
CREATE INDEX "InteractionCapture_tenantId_idx" ON "InteractionCapture"("tenantId");

-- CreateIndex
CREATE INDEX "ForwardingVerification_tenantId_idx" ON "ForwardingVerification"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkCompany" ADD CONSTRAINT "NetworkCompany_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkContact" ADD CONSTRAINT "NetworkContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsanaIntegration" ADD CONSTRAINT "AsanaIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarIntegration" ADD CONSTRAINT "GoogleCalendarIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationProfile" ADD CONSTRAINT "OrganizationProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceKey" ADD CONSTRAINT "ServiceKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingType" ADD CONSTRAINT "BookingType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAvailabilityRule" ADD CONSTRAINT "BookingAvailabilityRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStar" ADD CONSTRAINT "ProjectStar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSection" ADD CONSTRAINT "TaskSection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskProjectLink" ADD CONSTRAINT "TaskProjectLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTag" ADD CONSTRAINT "TaskTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCustomField" ADD CONSTRAINT "TaskCustomField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCustomFieldValue" ADD CONSTRAINT "TaskCustomFieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskForm" ADD CONSTRAINT "TaskForm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAccount" ADD CONSTRAINT "ContactAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionParticipant" ADD CONSTRAINT "InteractionParticipant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionCapture" ADD CONSTRAINT "InteractionCapture_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardingVerification" ADD CONSTRAINT "ForwardingVerification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

