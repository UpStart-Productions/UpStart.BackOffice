-- AlterTable
ALTER TABLE "Payable" ADD COLUMN "stripeReceiptNumber" TEXT;
ALTER TABLE "Payable" ADD COLUMN "stripeReceiptUrl" TEXT;
ALTER TABLE "Payable" ADD COLUMN "receiptEmailedAt" TIMESTAMP(3);
