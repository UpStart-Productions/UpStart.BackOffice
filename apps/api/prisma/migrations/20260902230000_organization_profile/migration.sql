-- CreateTable
CREATE TABLE "OrganizationProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationProfile_pkey" PRIMARY KEY ("id")
);
