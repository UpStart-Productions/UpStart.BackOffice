-- Client custom fields: tenant-defined sections and fields on the organization page.
CREATE TYPE "ClientFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT', 'CHECKBOX');

CREATE TABLE "ClientFieldSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientFieldSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ClientFieldType" NOT NULL,
    "options" JSONB,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientFieldValue" (
    "tenantId" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientFieldValue_pkey" PRIMARY KEY ("clientId","fieldId")
);

CREATE INDEX "ClientFieldSection_tenantId_sortOrder_idx" ON "ClientFieldSection"("tenantId", "sortOrder");
CREATE INDEX "ClientField_sectionId_sortOrder_idx" ON "ClientField"("sectionId", "sortOrder");
CREATE INDEX "ClientField_tenantId_idx" ON "ClientField"("tenantId");
CREATE INDEX "ClientFieldValue_fieldId_idx" ON "ClientFieldValue"("fieldId");
CREATE INDEX "ClientFieldValue_tenantId_idx" ON "ClientFieldValue"("tenantId");

ALTER TABLE "ClientFieldSection" ADD CONSTRAINT "ClientFieldSection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientField" ADD CONSTRAINT "ClientField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientField" ADD CONSTRAINT "ClientField_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ClientFieldSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientFieldValue" ADD CONSTRAINT "ClientFieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientFieldValue" ADD CONSTRAINT "ClientFieldValue_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientFieldValue" ADD CONSTRAINT "ClientFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ClientField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
