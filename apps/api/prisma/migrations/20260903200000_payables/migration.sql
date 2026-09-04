-- CreateEnum
CREATE TYPE "PayableKind" AS ENUM ('INVOICE');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PAID', 'CANCELED');

-- CreateTable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "kind" "PayableKind" NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "invoiceId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payable_token_key" ON "Payable"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Payable_invoiceId_key" ON "Payable"("invoiceId");

-- CreateIndex
CREATE INDEX "Payable_kind_status_idx" ON "Payable"("kind", "status");

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
