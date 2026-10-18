-- Team email domains per tenant (was the INTERNAL_EMAIL_DOMAINS env var).
ALTER TABLE "Tenant" ADD COLUMN "internalDomains" TEXT[] DEFAULT ARRAY[]::TEXT[];
