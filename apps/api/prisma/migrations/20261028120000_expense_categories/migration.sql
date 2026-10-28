CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExpenseCategory_tenantId_idx" ON "ExpenseCategory"("tenantId");

CREATE UNIQUE INDEX "ExpenseCategory_tenantId_slug_key" ON "ExpenseCategory"("tenantId", "slug");

CREATE UNIQUE INDEX "ExpenseCategory_tenantId_nameKey_key" ON "ExpenseCategory"("tenantId", "nameKey");

ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default categories for every tenant (stable slugs).
INSERT INTO "ExpenseCategory" ("id", "tenantId", "slug", "name", "nameKey", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT
  'ec_' || substr(md5(t."id" || ':' || d.slug), 1, 24),
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
    ('software', 'Software', 0),
    ('travel', 'Travel', 1),
    ('mileage', 'Mileage', 2),
    ('meals', 'Meals', 3),
    ('supplies', 'Supplies', 4),
    ('contractor', 'Contractor', 5),
    ('advertising', 'Advertising', 6),
    ('other', 'Other', 7)
) AS d(slug, name, ord);
