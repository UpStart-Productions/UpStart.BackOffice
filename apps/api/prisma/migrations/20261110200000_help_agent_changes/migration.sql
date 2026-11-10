-- Back Office guide: per-tenant switch to let it propose changes (each confirmed by the person).
ALTER TABLE "OrganizationProfile" ADD COLUMN "guideMakesChanges" BOOLEAN NOT NULL DEFAULT false;
