-- Booking types can leave the guest confirmation email to another service (e.g. the tenant's website).
ALTER TABLE "BookingType" ADD COLUMN "sendGuestConfirmation" BOOLEAN NOT NULL DEFAULT true;
