-- A super user's pay rate per tenant (their user row belongs to no tenant).
-- CreateTable
CREATE TABLE "SuperUserRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "userId" TEXT NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperUserRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuperUserRate_tenantId_idx" ON "SuperUserRate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SuperUserRate_tenantId_userId_key" ON "SuperUserRate"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "SuperUserRate" ADD CONSTRAINT "SuperUserRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuperUserRate" ADD CONSTRAINT "SuperUserRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
