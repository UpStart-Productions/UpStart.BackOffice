-- One person can belong to several tenants: User.email is unique per tenant, not globally.
DROP INDEX "User_email_key";

CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
CREATE INDEX "User_email_idx" ON "User"("email");

-- Postgres treats NULLs as distinct, so keep platform operators (no tenant) unique by email.
CREATE UNIQUE INDEX "User_email_no_tenant_key" ON "User"("email") WHERE "tenantId" IS NULL;
