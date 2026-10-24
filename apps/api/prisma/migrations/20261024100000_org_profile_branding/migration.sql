-- Organization profile: company name and logo for invoices and top bar branding.
ALTER TABLE "OrganizationProfile" ADD COLUMN "companyName" TEXT;
ALTER TABLE "OrganizationProfile" ADD COLUMN "logoUrl" TEXT;
