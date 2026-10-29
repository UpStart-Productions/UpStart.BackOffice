-- Care module. Replaces the short-lived client custom fields (never released) with Care forms:
-- tenant-defined forms, one living record per organization per form, and public links.
DROP TABLE IF EXISTS "ClientFieldValue";
DROP TABLE IF EXISTS "ClientField";
DROP TABLE IF EXISTS "ClientFieldSection";
DROP TYPE IF EXISTS "ClientFieldType";

CREATE TYPE "CareFormKind" AS ENUM ('INTAKE', 'CARE_PROFILE');
CREATE TYPE "FormFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT', 'CHECKBOX');
CREATE TYPE "CareRecordStatus" AS ENUM ('PENDING', 'ACTIVE');
CREATE TYPE "CareLinkKind" AS ENUM ('NEW_INTAKE', 'CLIENT_UPDATE');
CREATE TYPE "CareLinkVerify" AS ENUM ('NONE', 'PASSCODE', 'EMAIL_CODE');

CREATE TABLE "CareForm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "kind" "CareFormKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "access" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareForm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareFormSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "formId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareFormSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareFormField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FormFieldType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareFormField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "formId" TEXT NOT NULL,
    "clientId" TEXT,
    "status" "CareRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "values" JSONB NOT NULL DEFAULT '{}',
    "submitterName" TEXT,
    "submitterEmail" TEXT,
    "submitterPhone" TEXT,
    "publicUpdatedAt" TIMESTAMP(3),
    "publicUpdatedBy" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareFormLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "formId" TEXT NOT NULL,
    "kind" "CareLinkKind" NOT NULL,
    "clientId" TEXT,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "verify" "CareLinkVerify" NOT NULL DEFAULT 'NONE',
    "passcodeHash" TEXT,
    "email" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareFormLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareLinkAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "linkId" TEXT NOT NULL,
    "email" TEXT,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "token" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareLinkAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CareForm_tenantId_kind_key" ON "CareForm"("tenantId", "kind");
CREATE INDEX "CareFormSection_formId_sortOrder_idx" ON "CareFormSection"("formId", "sortOrder");
CREATE INDEX "CareFormSection_tenantId_idx" ON "CareFormSection"("tenantId");
CREATE INDEX "CareFormField_sectionId_sortOrder_idx" ON "CareFormField"("sectionId", "sortOrder");
CREATE INDEX "CareFormField_tenantId_idx" ON "CareFormField"("tenantId");
CREATE UNIQUE INDEX "CareRecord_formId_clientId_key" ON "CareRecord"("formId", "clientId");
CREATE INDEX "CareRecord_clientId_idx" ON "CareRecord"("clientId");
CREATE INDEX "CareRecord_tenantId_status_idx" ON "CareRecord"("tenantId", "status");
CREATE UNIQUE INDEX "CareFormLink_token_key" ON "CareFormLink"("token");
CREATE INDEX "CareFormLink_formId_idx" ON "CareFormLink"("formId");
CREATE INDEX "CareFormLink_clientId_idx" ON "CareFormLink"("clientId");
CREATE INDEX "CareFormLink_tenantId_idx" ON "CareFormLink"("tenantId");
CREATE UNIQUE INDEX "CareLinkAccess_token_key" ON "CareLinkAccess"("token");
CREATE INDEX "CareLinkAccess_linkId_idx" ON "CareLinkAccess"("linkId");
CREATE INDEX "CareLinkAccess_tenantId_idx" ON "CareLinkAccess"("tenantId");

ALTER TABLE "CareForm" ADD CONSTRAINT "CareForm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareFormSection" ADD CONSTRAINT "CareFormSection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareFormSection" ADD CONSTRAINT "CareFormSection_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CareForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareFormField" ADD CONSTRAINT "CareFormField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareFormField" ADD CONSTRAINT "CareFormField_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CareFormSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CareForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareRecord" ADD CONSTRAINT "CareRecord_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CareFormLink" ADD CONSTRAINT "CareFormLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareFormLink" ADD CONSTRAINT "CareFormLink_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CareForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareFormLink" ADD CONSTRAINT "CareFormLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareLinkAccess" ADD CONSTRAINT "CareLinkAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CareLinkAccess" ADD CONSTRAINT "CareLinkAccess_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "CareFormLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
