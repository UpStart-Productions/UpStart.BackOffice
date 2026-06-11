-- CreateTable
CREATE TABLE "BookingType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "hostUserId" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "bufferMin" INTEGER NOT NULL DEFAULT 0,
    "minNoticeHours" INTEGER NOT NULL DEFAULT 4,
    "maxDaysAhead" INTEGER NOT NULL DEFAULT 60,
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "publicPageUrl" TEXT NOT NULL,
    "calendarEventTitle" TEXT NOT NULL DEFAULT 'Meeting',
    "createLead" BOOLEAN NOT NULL DEFAULT true,
    "leadStage" "LeadStage" NOT NULL DEFAULT 'DISCOVERY',
    "leadSource" "LeadSource" NOT NULL DEFAULT 'INBOUND',
    "pipelineNoteTitle" TEXT,
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isBillable" BOOLEAN NOT NULL DEFAULT false,
    "paymentRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingType_pkey" PRIMARY KEY ("id")
);

-- Migrate singleton settings → default booking type
INSERT INTO "BookingType" (
    "id",
    "slug",
    "name",
    "brand",
    "isActive",
    "hostUserId",
    "durationMin",
    "bufferMin",
    "minNoticeHours",
    "maxDaysAhead",
    "timezone",
    "publicPageUrl",
    "calendarEventTitle",
    "createLead",
    "leadStage",
    "leadSource",
    "pipelineNoteTitle",
    "sortOrder",
    "updatedAt"
)
SELECT
    'bt_upstart_discovery',
    'upstart-discovery',
    'UpStart Discovery Chat',
    'UpStart',
    true,
    "hostUserId",
    "durationMin",
    "bufferMin",
    "minNoticeHours",
    "maxDaysAhead",
    "timezone",
    "publicPageUrl",
    'Discovery Chat with UpStart Productions',
    true,
    'DISCOVERY'::"LeadStage",
    'INBOUND'::"LeadSource",
    'Discovery call',
    0,
    CURRENT_TIMESTAMP
FROM "BookingSettings"
WHERE "id" = 'default';

-- Fallback if no settings row existed
INSERT INTO "BookingType" (
    "id",
    "slug",
    "name",
    "brand",
    "hostUserId",
    "publicPageUrl",
    "calendarEventTitle",
    "pipelineNoteTitle",
    "updatedAt"
)
SELECT
    'bt_upstart_discovery',
    'upstart-discovery',
    'UpStart Discovery Chat',
    'UpStart',
    u."id",
    'https://heyupstart.com/book-discovery-chat',
    'Discovery Chat with UpStart Productions',
    'Discovery call',
    CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "BookingType" WHERE "id" = 'bt_upstart_discovery')
ORDER BY u."createdAt" ASC
LIMIT 1;

-- Repoint availability rules
ALTER TABLE "BookingAvailabilityRule" ADD COLUMN "bookingTypeId" TEXT;

UPDATE "BookingAvailabilityRule"
SET "bookingTypeId" = 'bt_upstart_discovery'
WHERE "bookingTypeId" IS NULL;

ALTER TABLE "BookingAvailabilityRule" DROP CONSTRAINT IF EXISTS "BookingAvailabilityRule_settingsId_fkey";
ALTER TABLE "BookingAvailabilityRule" DROP COLUMN "settingsId";
ALTER TABLE "BookingAvailabilityRule" ALTER COLUMN "bookingTypeId" SET NOT NULL;

-- Repoint bookings
ALTER TABLE "Booking" ADD COLUMN "bookingTypeId" TEXT;

UPDATE "Booking"
SET "bookingTypeId" = 'bt_upstart_discovery'
WHERE "bookingTypeId" IS NULL;

ALTER TABLE "Booking" ALTER COLUMN "bookingTypeId" SET NOT NULL;

-- Drop old settings table
DROP TABLE "BookingSettings";

-- CreateIndex
CREATE UNIQUE INDEX "BookingType_slug_key" ON "BookingType"("slug");
CREATE INDEX "BookingType_isActive_idx" ON "BookingType"("isActive");
CREATE INDEX "BookingType_sortOrder_idx" ON "BookingType"("sortOrder");
CREATE INDEX "BookingAvailabilityRule_bookingTypeId_idx" ON "BookingAvailabilityRule"("bookingTypeId");
CREATE INDEX "Booking_bookingTypeId_idx" ON "Booking"("bookingTypeId");

-- AddForeignKey
ALTER TABLE "BookingType" ADD CONSTRAINT "BookingType_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingAvailabilityRule" ADD CONSTRAINT "BookingAvailabilityRule_bookingTypeId_fkey" FOREIGN KEY ("bookingTypeId") REFERENCES "BookingType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookingTypeId_fkey" FOREIGN KEY ("bookingTypeId") REFERENCES "BookingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
