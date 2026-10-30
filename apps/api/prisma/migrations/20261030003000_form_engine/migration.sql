-- Form engine (core). Care's forms become generic forms owned by a module. Renames only: every row and id is
-- kept, so Care records, links and the visit checklist answers (keyed by field id) carry over unchanged.

-- Enums
ALTER TYPE "CareRecordStatus" RENAME TO "FormResponseStatus";
ALTER TYPE "CareLinkKind" RENAME TO "FormLinkKind";
ALTER TYPE "FormLinkKind" RENAME VALUE 'NEW_INTAKE' TO 'NEW';
ALTER TYPE "FormLinkKind" RENAME VALUE 'CLIENT_UPDATE' TO 'CLIENT';
ALTER TYPE "CareLinkVerify" RENAME TO "FormLinkVerify";

-- Form: kind becomes module + key
ALTER TABLE "CareForm" RENAME TO "Form";
ALTER TABLE "Form" ADD COLUMN "module" TEXT;
ALTER TABLE "Form" ADD COLUMN "key" TEXT;
UPDATE "Form" SET "module" = 'care', "key" = "kind"::text;
ALTER TABLE "Form" ALTER COLUMN "module" SET NOT NULL;
DROP INDEX "CareForm_tenantId_kind_key";
ALTER TABLE "Form" DROP COLUMN "kind";
DROP TYPE "CareFormKind";
ALTER TABLE "Form" RENAME CONSTRAINT "CareForm_pkey" TO "Form_pkey";
ALTER TABLE "Form" RENAME CONSTRAINT "CareForm_tenantId_fkey" TO "Form_tenantId_fkey";
CREATE UNIQUE INDEX "Form_tenantId_module_key_key" ON "Form"("tenantId", "module", "key");
CREATE INDEX "Form_tenantId_module_idx" ON "Form"("tenantId", "module");


-- CareFormSection -> FormSection
ALTER TABLE "CareFormSection" RENAME TO "FormSection";
ALTER TABLE "FormSection" RENAME CONSTRAINT "CareFormSection_pkey" TO "FormSection_pkey";
ALTER TABLE "FormSection" RENAME CONSTRAINT "CareFormSection_tenantId_fkey" TO "FormSection_tenantId_fkey";
ALTER TABLE "FormSection" RENAME CONSTRAINT "CareFormSection_formId_fkey" TO "FormSection_formId_fkey";
ALTER INDEX "CareFormSection_formId_sortOrder_idx" RENAME TO "FormSection_formId_sortOrder_idx";
ALTER INDEX "CareFormSection_tenantId_idx" RENAME TO "FormSection_tenantId_idx";

-- CareFormField -> FormField
ALTER TABLE "CareFormField" RENAME TO "FormField";
ALTER TABLE "FormField" RENAME CONSTRAINT "CareFormField_pkey" TO "FormField_pkey";
ALTER TABLE "FormField" RENAME CONSTRAINT "CareFormField_tenantId_fkey" TO "FormField_tenantId_fkey";
ALTER TABLE "FormField" RENAME CONSTRAINT "CareFormField_sectionId_fkey" TO "FormField_sectionId_fkey";
ALTER INDEX "CareFormField_sectionId_sortOrder_idx" RENAME TO "FormField_sectionId_sortOrder_idx";
ALTER INDEX "CareFormField_tenantId_idx" RENAME TO "FormField_tenantId_idx";

-- CareRecord -> FormResponse
ALTER TABLE "CareRecord" RENAME TO "FormResponse";
ALTER TABLE "FormResponse" RENAME CONSTRAINT "CareRecord_pkey" TO "FormResponse_pkey";
ALTER TABLE "FormResponse" RENAME CONSTRAINT "CareRecord_tenantId_fkey" TO "FormResponse_tenantId_fkey";
ALTER TABLE "FormResponse" RENAME CONSTRAINT "CareRecord_formId_fkey" TO "FormResponse_formId_fkey";
ALTER TABLE "FormResponse" RENAME CONSTRAINT "CareRecord_clientId_fkey" TO "FormResponse_clientId_fkey";
ALTER TABLE "FormResponse" RENAME CONSTRAINT "CareRecord_createdByUserId_fkey" TO "FormResponse_createdByUserId_fkey";
ALTER TABLE "FormResponse" RENAME CONSTRAINT "CareRecord_updatedByUserId_fkey" TO "FormResponse_updatedByUserId_fkey";
ALTER INDEX "CareRecord_formId_clientId_key" RENAME TO "FormResponse_formId_clientId_key";
ALTER INDEX "CareRecord_clientId_idx" RENAME TO "FormResponse_clientId_idx";
ALTER INDEX "CareRecord_tenantId_status_idx" RENAME TO "FormResponse_tenantId_status_idx";

-- CareFormLink -> FormLink
ALTER TABLE "CareFormLink" RENAME TO "FormLink";
ALTER TABLE "FormLink" RENAME CONSTRAINT "CareFormLink_pkey" TO "FormLink_pkey";
ALTER TABLE "FormLink" RENAME CONSTRAINT "CareFormLink_tenantId_fkey" TO "FormLink_tenantId_fkey";
ALTER TABLE "FormLink" RENAME CONSTRAINT "CareFormLink_formId_fkey" TO "FormLink_formId_fkey";
ALTER TABLE "FormLink" RENAME CONSTRAINT "CareFormLink_clientId_fkey" TO "FormLink_clientId_fkey";
ALTER INDEX "CareFormLink_token_key" RENAME TO "FormLink_token_key";
ALTER INDEX "CareFormLink_formId_idx" RENAME TO "FormLink_formId_idx";
ALTER INDEX "CareFormLink_clientId_idx" RENAME TO "FormLink_clientId_idx";
ALTER INDEX "CareFormLink_tenantId_idx" RENAME TO "FormLink_tenantId_idx";

-- CareLinkAccess -> FormLinkAccess
ALTER TABLE "CareLinkAccess" RENAME TO "FormLinkAccess";
ALTER TABLE "FormLinkAccess" RENAME CONSTRAINT "CareLinkAccess_pkey" TO "FormLinkAccess_pkey";
ALTER TABLE "FormLinkAccess" RENAME CONSTRAINT "CareLinkAccess_tenantId_fkey" TO "FormLinkAccess_tenantId_fkey";
ALTER TABLE "FormLinkAccess" RENAME CONSTRAINT "CareLinkAccess_linkId_fkey" TO "FormLinkAccess_linkId_fkey";
ALTER INDEX "CareLinkAccess_token_key" RENAME TO "FormLinkAccess_token_key";
ALTER INDEX "CareLinkAccess_linkId_idx" RENAME TO "FormLinkAccess_linkId_idx";
ALTER INDEX "CareLinkAccess_tenantId_idx" RENAME TO "FormLinkAccess_tenantId_idx";
