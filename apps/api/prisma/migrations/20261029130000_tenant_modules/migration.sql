-- Per-tenant modules. Every existing tenant keeps Bookings, so nothing changes until a module is switched off.
ALTER TABLE "Tenant" ADD COLUMN "modules" TEXT[] DEFAULT ARRAY['bookings']::TEXT[];
