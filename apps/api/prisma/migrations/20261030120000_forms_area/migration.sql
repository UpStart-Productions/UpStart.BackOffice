-- Forms area: published versions, scoring, submissions with scores and a results token.
-- Care's one-copy-per-organization rule becomes a partial unique index on living copies.
-- AlterEnum
ALTER TYPE "FormResponseStatus" ADD VALUE 'DISMISSED';

-- DropIndex
DROP INDEX "FormResponse_formId_clientId_key";

-- AlterTable
ALTER TABLE "Form" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "publishedVersionId" TEXT,
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "FormField" ADD COLUMN     "scoreGroupId" TEXT;

-- AlterTable
ALTER TABLE "FormResponse" ADD COLUMN     "living" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resultToken" TEXT,
ADD COLUMN     "scores" JSONB,
ADD COLUMN     "submitterOrganization" TEXT,
ADD COLUMN     "versionId" TEXT;

-- CreateTable
CREATE TABLE "FormVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "formId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormVersion_tenantId_idx" ON "FormVersion"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FormVersion_formId_number_key" ON "FormVersion"("formId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Form_publishedVersionId_key" ON "Form"("publishedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_resultToken_key" ON "FormResponse"("resultToken");

-- CreateIndex
CREATE INDEX "FormResponse_formId_clientId_idx" ON "FormResponse"("formId", "clientId");

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "FormVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FormVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every existing response is a Care record: mark them living copies.
UPDATE "FormResponse" SET "living" = true;

-- One living copy per organization per form.
CREATE UNIQUE INDEX "FormResponse_living_formId_clientId_key" ON "FormResponse"("formId", "clientId") WHERE "living" = true;
