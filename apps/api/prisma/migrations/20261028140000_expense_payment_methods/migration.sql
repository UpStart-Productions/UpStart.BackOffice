CREATE TABLE "ExpensePaymentMethod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpensePaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExpensePaymentMethod_tenantId_idx" ON "ExpensePaymentMethod"("tenantId");

CREATE UNIQUE INDEX "ExpensePaymentMethod_tenantId_slug_key" ON "ExpensePaymentMethod"("tenantId", "slug");

CREATE UNIQUE INDEX "ExpensePaymentMethod_tenantId_nameKey_key" ON "ExpensePaymentMethod"("tenantId", "nameKey");

ALTER TABLE "ExpensePaymentMethod" ADD CONSTRAINT "ExpensePaymentMethod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ExpensePaymentMethod" ("id", "tenantId", "slug", "name", "nameKey", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT
  'epm_' || substr(md5(t."id" || ':' || d.slug), 1, 24),
  t."id",
  d.slug,
  d.name,
  lower(d.name),
  d.ord,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (
  VALUES
    ('personal-card', 'Personal Card', 0),
    ('company-card', 'Company Card', 1),
    ('cash', 'Cash', 2),
    ('epayment', 'ePayment (e.g. Venmo, PayPal, CashApp)', 3)
) AS d(slug, name, ord);
