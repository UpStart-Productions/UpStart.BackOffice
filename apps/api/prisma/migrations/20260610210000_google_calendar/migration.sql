-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "googleEventId" TEXT;

-- CreateTable
CREATE TABLE "GoogleCalendarIntegration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "clientId" TEXT,
    "clientSecretEnc" TEXT,
    "redirectUri" TEXT,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "calendarId" TEXT,
    "calendarSummary" TEXT,
    "connectedByEmail" TEXT,
    "pendingOAuthState" TEXT,
    "pendingOAuthStateExpiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarIntegration_pkey" PRIMARY KEY ("id")
);
