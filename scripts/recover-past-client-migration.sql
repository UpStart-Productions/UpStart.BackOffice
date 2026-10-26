-- Run this ONLY if migrate failed partway through 20261026180000_remove_past_client_journey
-- (Postgres error: default for column "journey" cannot be cast automatically).
--
-- Then: npx prisma migrate resolve --applied 20261026180000_remove_past_client_journey
--       npx prisma generate

-- ── AccountJourney (failed mid-migration: both types exist, Client still on _old) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountJourney_old')
     AND EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountJourney') THEN
    ALTER TABLE "Client" ALTER COLUMN "journey" DROP DEFAULT;
    ALTER TABLE "Client"
      ALTER COLUMN "journey" TYPE "AccountJourney"
      USING ("journey"::text::"AccountJourney");
    ALTER TABLE "Client" ALTER COLUMN "journey" SET DEFAULT 'CLIENT'::"AccountJourney";
    DROP TYPE "AccountJourney_old";
  END IF;
END $$;

-- ── LeadStage (only if migration failed before this block finished) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadStage_old')
     AND EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadStage') THEN
    ALTER TABLE "Lead" ALTER COLUMN "stage" DROP DEFAULT;
    ALTER TABLE "Lead"
      ALTER COLUMN "stage" TYPE "LeadStage"
      USING ("stage"::text::"LeadStage");
    ALTER TABLE "Lead" ALTER COLUMN "stage" SET DEFAULT 'NEW_LEAD'::"LeadStage";
    ALTER TABLE "BookingType" ALTER COLUMN "leadStage" DROP DEFAULT;
    ALTER TABLE "BookingType"
      ALTER COLUMN "leadStage" TYPE "LeadStage"
      USING ("leadStage"::text::"LeadStage");
    ALTER TABLE "BookingType" ALTER COLUMN "leadStage" SET DEFAULT 'DISCOVERY'::"LeadStage";
    ALTER TABLE "PipelineStage"
      ALTER COLUMN "legacyKey" TYPE "LeadStage"
      USING ("legacyKey"::text::"LeadStage");
    DROP TYPE "LeadStage_old";
  END IF;
END $$;
