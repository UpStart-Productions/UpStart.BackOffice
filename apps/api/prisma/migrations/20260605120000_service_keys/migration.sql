-- CreateTable
CREATE TABLE "ServiceKey" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "keyHash"    TEXT NOT NULL,
    "keyPrefix"  TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceKey_keyHash_key" ON "ServiceKey"("keyHash");
