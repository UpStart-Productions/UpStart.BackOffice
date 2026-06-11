-- Drop default buffer between discovery call slots; times align on the hour and half-hour.
ALTER TABLE "BookingSettings" ALTER COLUMN "bufferMin" SET DEFAULT 0;
UPDATE "BookingSettings" SET "bufferMin" = 0;
