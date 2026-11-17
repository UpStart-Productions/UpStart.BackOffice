-- CreateTable
CREATE TABLE "StripeIntegration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publishableKey" TEXT,
    "secretKeyEnc" TEXT,
    "webhookSecretEnc" TEXT,
    "connectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeIntegration_tenantId_key" ON "StripeIntegration"("tenantId");

-- AddForeignKey
ALTER TABLE "StripeIntegration" ADD CONSTRAINT "StripeIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;