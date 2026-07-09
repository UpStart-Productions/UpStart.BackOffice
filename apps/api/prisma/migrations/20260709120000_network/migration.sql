-- CreateTable
CREATE TABLE "NetworkCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "description" TEXT,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "focusCategories" "OrgCategory"[] DEFAULT ARRAY[]::"OrgCategory"[],
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isReferralReady" BOOLEAN NOT NULL DEFAULT false,
    "isPublicFeatured" BOOLEAN NOT NULL DEFAULT false,
    "publicSortOrder" INTEGER NOT NULL DEFAULT 0,
    "lastContactDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "lastContactDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkContact_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Artifact" ADD COLUMN "networkCompanyId" TEXT;
ALTER TABLE "Artifact" ADD COLUMN "networkContactId" TEXT;

-- CreateIndex
CREATE INDEX "NetworkCompany_name_idx" ON "NetworkCompany"("name");
CREATE INDEX "NetworkCompany_isReferralReady_idx" ON "NetworkCompany"("isReferralReady");
CREATE INDEX "NetworkCompany_isPublicFeatured_idx" ON "NetworkCompany"("isPublicFeatured");
CREATE INDEX "NetworkContact_companyId_idx" ON "NetworkContact"("companyId");
CREATE INDEX "NetworkContact_email_idx" ON "NetworkContact"("email");
CREATE INDEX "Artifact_networkCompanyId_idx" ON "Artifact"("networkCompanyId");
CREATE INDEX "Artifact_networkContactId_idx" ON "Artifact"("networkContactId");

-- AddForeignKey
ALTER TABLE "NetworkContact" ADD CONSTRAINT "NetworkContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "NetworkCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_networkCompanyId_fkey" FOREIGN KEY ("networkCompanyId") REFERENCES "NetworkCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_networkContactId_fkey" FOREIGN KEY ("networkContactId") REFERENCES "NetworkContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
